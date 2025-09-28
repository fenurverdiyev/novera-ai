"""
NovEra TTS Backend (LOVO)
"""

import os
import base64
import asyncio
from typing import Optional, Any, Dict

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse
from pydantic import BaseModel
import httpx

try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    # optional in production
    pass

# CORS origins (Vite dev ports by default)
ALLOWED_ORIGINS = [o for o in (os.getenv("ALLOWED_ORIGINS", "http://localhost:5175,http://localhost:5173").split(",")) if o]

# LOVO.ai (Genny API)
LOVO_API_KEY = os.getenv("LOVO_API_KEY")
DEFAULT_SPEAKER_ID = os.getenv("DEFAULT_SPEAKER_ID", "")
LOVO_BASE = os.getenv("LOVO_BASE", "https://api.genny.lovo.ai/api/v1")

if not LOVO_API_KEY:
    raise RuntimeError("LOVO_API_KEY is not set. Put it in backend/fastapi/.env or environment.")

app = FastAPI(title="NovEra TTS Backend (LOVO)", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TTSRequest(BaseModel):
    text: str
    voice_id: Optional[str] = None  # LOVO speaker id
    output_format: Optional[str] = "mp3_44100_128"  # kept for compat; LOVO returns mp3 by default


async def lovo_tts_bytes(*, text: str, speaker_id: str, poll_timeout: float = 60.0) -> bytes:
    """Create LOVO TTS job, poll until done, then download audio bytes."""
    headers_json = {"Content-Type": "application/json", "X-API-KEY": LOVO_API_KEY}

    # Create job
    async with httpx.AsyncClient(timeout=httpx.Timeout(30.0)) as client:
        resp = await client.post(f"{LOVO_BASE}/tts", headers=headers_json, json={
            "speaker": speaker_id,
            "text": text,
        })
        if resp.status_code >= 400:
            raise HTTPException(status_code=resp.status_code, detail=f"LOVO create job error: {resp.text}")
        data = resp.json()
        job_id = data.get("jobId") or data.get("id")
        if not job_id:
            raise HTTPException(status_code=500, detail=f"LOVO missing jobId: {data}")

    # Poll job
    elapsed = 0.0
    async with httpx.AsyncClient(timeout=httpx.Timeout(30.0)) as client:
        while elapsed < poll_timeout:
            jr = await client.get(f"{LOVO_BASE}/tts/{job_id}", headers={"X-API-KEY": LOVO_API_KEY})
            if jr.status_code >= 400:
                raise HTTPException(status_code=jr.status_code, detail=f"LOVO poll error: {jr.text}")
            j = jr.json()
            status = (j.get("jobStatus") or j.get("status") or "").lower()
            if status in ("done", "completed"):
                audio_url = j.get("audioUrl") or j.get("resultUrl") or j.get("url")
                if not audio_url:
                    result = j.get("result") or {}
                    audio_url = result.get("audioUrl") or result.get("url")
                if not audio_url:
                    raise HTTPException(status_code=500, detail=f"LOVO job done but no audio url: {j}")
                ar = await client.get(audio_url)
                if ar.status_code >= 400:
                    raise HTTPException(status_code=ar.status_code, detail=f"LOVO audio fetch error: {ar.text}")
                return ar.content
            if status in ("failed", "error"):
                raise HTTPException(status_code=500, detail="LOVO TTS failed")
            await asyncio.sleep(1.0)
            elapsed += 1.0

    raise HTTPException(status_code=504, detail="LOVO TTS timed out")


@app.post("/api/tts")
async def tts(req: TTSRequest, format: str = Query("binary", pattern="^(binary|base64)$")):
    text = (req.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="'text' is required")

    speaker_id = (req.voice_id or DEFAULT_SPEAKER_ID).strip()
    if not speaker_id:
        raise HTTPException(status_code=400, detail="'voice_id' (speaker) is required")

    audio_bytes = await lovo_tts_bytes(text=text, speaker_id=speaker_id)

    if format == "base64":
        b64 = base64.b64encode(audio_bytes).decode("utf-8")
        return JSONResponse({"audio_base64": b64})

    return Response(content=audio_bytes, media_type="audio/mpeg", headers={"Cache-Control": "no-store"})


@app.get("/api/tts/stream")
async def tts_stream(
    text: str = Query(..., description="Text to synthesize"),
    voice_id: Optional[str] = Query(None),
):
    text = (text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="'text' is required")

    speaker_id = (voice_id or DEFAULT_SPEAKER_ID).strip()
    if not speaker_id:
        raise HTTPException(status_code=400, detail="'voice_id' (speaker) is required")

    audio_bytes = await lovo_tts_bytes(text=text, speaker_id=speaker_id)

    # Non-chunked stream: return full audio as soon as it's ready
    return Response(content=audio_bytes, media_type="audio/mpeg", headers={"Cache-Control": "no-store"})


@app.get("/api/voices")
async def list_voices():
    """Return LOVO speakers with optional gender and recommended list.

    Response shape:
      {
        "voices": [{ id, name, category, gender? }...],
        "recommended": [speaker_id, ...]   # optional
      }
    """
    async with httpx.AsyncClient(timeout=httpx.Timeout(15.0)) as client:
        resp = await client.get(f"{LOVO_BASE}/speakers", headers={"X-API-KEY": LOVO_API_KEY})
        if resp.status_code >= 400:
            raise HTTPException(status_code=resp.status_code, detail=resp.text)
        data = resp.json() or {}
        raw_list = data.get("speakers") or data.get("data") or data.get("items") or []

        # Build voices with best-effort gender extraction
        voices = []
        for v in raw_list:
            vid = v.get("id") or v.get("_id") or v.get("speakerId") or v.get("voice_id")
            name = v.get("name") or v.get("title") or v.get("displayName") or v.get("label")
            gender = (
                (v.get("gender") or v.get("sex") or "")
                or (v.get("meta", {}) or {}).get("gender")
                or (v.get("metadata", {}) or {}).get("gender")
                or (v.get("attributes", {}) or {}).get("gender")
                or ""
            )
            gender = (gender or "").lower()
            if vid and name:
                item = {"id": vid, "name": name, "category": "custom"}
                if gender:
                    item["gender"] = gender
                voices.append(item)

        # Recommended via env or fallback to first 2 female + 2 male if gender exists
        rec_env = (os.getenv("RECOMMENDED_SPEAKER_IDS", "") or "").strip()
        recommended: list[str] = []
        if rec_env:
            recommended = [s.strip() for s in rec_env.split(",") if s.strip()]
        else:
            females = [v for v in voices if v.get("gender") in ("female", "woman", "female_voice")]
            males = [v for v in voices if v.get("gender") in ("male", "man", "male_voice")]
            recommended = [*(vid for vid in [x.get("id") for x in females[:2]] if vid), *(vid for vid in [x.get("id") for x in males[:2]] if vid)]

        payload: dict[str, Any] = {"voices": voices}
        if recommended:
            payload["recommended"] = recommended
        return payload
