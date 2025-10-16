"""
NovEra TTS Backend (LOVO)
"""

import os
import base64
import asyncio
import io
import wave
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
    print("Warning: LOVO_API_KEY is not set. TTS endpoints will be disabled until configured.")

# Gemini API (prefer dedicated translate key, fallback to generic)
TRANSLATE_API_KEY = os.getenv("GEMINI_TRANSLATE_API_KEY") or os.getenv("GEMINI_API_KEY")
# Gemini TTS API Key (prefer dedicated, fallback to generic)
GEMINI_TTS_API_KEY = os.getenv("GEMINI_TTS_API_KEY") or os.getenv("GEMINI_API_KEY")
GEMINI_TTS_MODEL = os.getenv("GEMINI_TTS_MODEL", "gemini-2.5-flash-preview-tts")
if TRANSLATE_API_KEY:
    try:
        import google.generativeai as genai
        genai.configure(api_key=TRANSLATE_API_KEY)
    except ImportError:
        print("Warning: google-generativeai is not installed. Translate endpoint will not work.")
        TRANSLATE_API_KEY = None  # Disable feature
else:
    print("Warning: GEMINI_TRANSLATE_API_KEY/GEMINI_API_KEY is not set. Translate endpoint will not work.")

# Gemini Live (ephemeral tokens) using new 'google-genai' SDK if available
GENAI_LIVE_AVAILABLE = False
try:
    from google import genai as genai_live  # type: ignore
    GENAI_LIVE_AVAILABLE = True
except Exception:
    GENAI_LIVE_AVAILABLE = False

app = FastAPI(title="NovEra Backend", version="1.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TranslateRequest(BaseModel):
    text: str
    target_language: str
    source_language: Optional[str] = None


class TTSRequest(BaseModel):
    text: str
    voice_id: Optional[str] = None  # LOVO speaker id
    output_format: Optional[str] = "mp3_44100_128"  # kept for compat; LOVO returns mp3 by default


class GeminiTTSRequest(BaseModel):
    text: str
    voice_name: Optional[str] = "Kore"
    sample_rate: Optional[int] = 24000
    channels: Optional[int] = 1


def pcm_to_wav_bytes(pcm: bytes, *, channels: int = 1, rate: int = 24000, sample_width: int = 2) -> bytes:
    """Wrap raw PCM (s16le) into WAV container and return bytes."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(channels)
        wf.setsampwidth(sample_width)
        wf.setframerate(rate)
        wf.writeframes(pcm)
    return buf.getvalue()


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
    if not LOVO_API_KEY:
        raise HTTPException(status_code=503, detail="TTS service is not configured on the server.")
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
    if not LOVO_API_KEY:
        raise HTTPException(status_code=503, detail="TTS service is not configured on the server.")
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


@app.post("/api/translate")
async def translate(req: TranslateRequest):
    """Translate text using Gemini API."""
    if not TRANSLATE_API_KEY:
        raise HTTPException(status_code=503, detail="Translate service is not configured on the server.")

    if not (req.text or "").strip():
        raise HTTPException(status_code=400, detail="'text' is required")
    if not (req.target_language or "").strip():
        raise HTTPException(status_code=400, detail="'target_language' is required")

    try:
        model = genai.GenerativeModel('gemini-2.5-flash')
        source_lang_instruction = f"from {req.source_language}" if req.source_language else "from the auto-detected language"
        prompt = (
            f"Translate the following text to {req.target_language} {source_lang_instruction}. "
            "Only return the translated text, without any additional explanations or context.\n\n"
            f"Text: '''{req.text}'''"
        )

        # Run the sync call off the event loop to avoid blocking
        response = await asyncio.to_thread(model.generate_content, prompt)
        translated_text = (response.text or "").strip()
        return JSONResponse({"translated_text": translated_text})

    except Exception as e:
        print(f"Gemini translation error: {e}")
        raise HTTPException(status_code=502, detail="Failed to translate text with Gemini API.")


@app.post("/api/gemini-live-token")
async def gemini_live_token():
    """Provision a short-lived ephemeral token for Gemini Live API client-side WebSocket connections.

    Returns: { token: string }
    """
    if not GEMINI_TTS_API_KEY and not os.getenv("GEMINI_API_KEY"):
        raise HTTPException(status_code=503, detail="Gemini API key is not configured on the server.")
    if not GENAI_LIVE_AVAILABLE:
        raise HTTPException(status_code=503, detail="google-genai package not installed on server.")

    try:
        # Create client with v1alpha for ephemeral auth tokens
        client = genai_live.Client(http_options={"api_version": "v1alpha"})
        # Create token with defaults: uses:1, expireTime: +30min, newSessionExpireTime: +1min
        token = await asyncio.to_thread(client.auth_tokens.create, {  # type: ignore
            "config": {
                "uses": 1,
                "http_options": {"api_version": "v1alpha"},
            }
        })
        name = getattr(token, "name", None) or token.get("name") if isinstance(token, dict) else None
        if not name:
            raise HTTPException(status_code=502, detail="Failed to issue ephemeral token")
        return JSONResponse({"token": name})
    except HTTPException:
        raise
    except Exception as e:
        print(f"Gemini Live token error: {e}")
        raise HTTPException(status_code=502, detail="Failed to create ephemeral token")


@app.post("/api/gemini-tts")
async def gemini_tts(req: GeminiTTSRequest, format: str = Query("binary", pattern="^(binary|base64)$")):
    """Synthesize speech using Gemini TTS via REST. Returns audio/wav or base64.

    Request body:
      { "text": str, "voice_name": str = "Kore", "sample_rate": 24000, "channels": 1 }
    """
    if not GEMINI_TTS_API_KEY:
        raise HTTPException(status_code=503, detail="Gemini TTS is not configured on the server.")

    text = (req.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="'text' is required")

    voice_name = (req.voice_name or "Kore").strip() or "Kore"
    sample_rate = int(req.sample_rate or 24000)
    channels = int(req.channels or 1)

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_TTS_MODEL}:generateContent"
    headers = {"x-goog-api-key": GEMINI_TTS_API_KEY, "Content-Type": "application/json"}
    payload: Dict[str, Any] = {
        "contents": [{"parts": [{"text": text}]}],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {
                "voiceConfig": {
                    "prebuiltVoiceConfig": {"voiceName": voice_name}
                }
            },
        },
        "model": GEMINI_TTS_MODEL,
    }

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(45.0)) as client:
            resp = await client.post(url, headers=headers, json=payload)
            if resp.status_code >= 400:
                raise HTTPException(status_code=resp.status_code, detail=f"Gemini TTS error: {resp.text}")
            data = resp.json()

        # Extract base64 PCM data (inlineData.data)
        try:
            parts = (
                data.get("candidates", [{}])[0]
                .get("content", {})
                .get("parts", [{}])
            )
            inline = parts[0].get("inlineData") or parts[0].get("inline_data") or {}
            b64 = inline.get("data")
        except Exception:
            b64 = None

        if not b64 or not isinstance(b64, str):
            raise HTTPException(status_code=502, detail="Gemini TTS returned no audio data")

        try:
            pcm_bytes = base64.b64decode(b64)
        except Exception:
            raise HTTPException(status_code=502, detail="Failed to decode Gemini TTS audio data")

        wav_bytes = pcm_to_wav_bytes(pcm_bytes, channels=channels, rate=sample_rate, sample_width=2)

        if format == "base64":
            return JSONResponse({"audio_base64": base64.b64encode(wav_bytes).decode("utf-8"), "mimeType": "audio/wav"})
        return Response(content=wav_bytes, media_type="audio/wav", headers={"Cache-Control": "no-store"})
    except HTTPException:
        raise
    except Exception as e:
        print(f"Gemini TTS exception: {e}")
        raise HTTPException(status_code=502, detail="Failed to synthesize speech with Gemini API.")
