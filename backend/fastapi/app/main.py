def sanitize_azeri_tts(input_text: str) -> str:
    try:
        s = input_text or ""
        # Remove emojis and symbols
        s = re.sub(r"[\U0001F300-\U0001FAFF\u2600-\u27BF]+", " ", s)
        # Normalize whitespace and punctuation spacing
        s = re.sub(r"[!?]+", ".", s)
        s = re.sub(r"\s+([\.,…])", r"\1", s)
        s = re.sub(r"\.{3,}", "…", s)
        s = re.sub(r"[“”""\*_/<>|#`~^]+", "", s)
        s = re.sub(r"\s+", " ", s).strip()
        if s and not re.search(r"[\.!?…]$", s):
            s += "."
        return s
    except Exception:
        return input_text or ""
"""
NovEra TTS Backend (LOVO)
"""

import os
import base64
import asyncio
import time
import io
import wave
from typing import Optional, Any, Dict
import re

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import Response, JSONResponse
from pydantic import BaseModel
import httpx

try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    # optional in production
    pass

def _load_env_files_if_needed():
    if os.getenv("ELEVENLABS_API_KEY") or os.getenv("VITE_ELEVENLABS_API_KEY"):
        return
    try:
        app_dir = os.path.dirname(__file__)
        fastapi_dir = os.path.dirname(app_dir)
        backend_dir = os.path.dirname(fastapi_dir)
        root_dir = os.path.dirname(backend_dir)
        candidates = [
            os.path.join(fastapi_dir, ".env"),
            os.path.join(root_dir, ".env"),
        ]
        for p in candidates:
            try:
                if os.path.exists(p):
                    with open(p, "r", encoding="utf-8") as f:
                        for line in f:
                            s = line.strip()
                            if not s or s.startswith("#") or "=" not in s:
                                continue
                            k, v = s.split("=", 1)
                            k = k.strip()
                            v = v.strip().strip('"').strip("'")
                            if k and (os.getenv(k) is None):
                                os.environ[k] = v
            except Exception:
                continue
    except Exception:
        pass

_load_env_files_if_needed()

# CORS origins (Vite dev ports by default)
ALLOWED_ORIGINS = [o for o in (os.getenv("ALLOWED_ORIGINS", "http://localhost:5176,http://localhost:5175,http://localhost:5173").split(",")) if o]

# LOVO.ai (Genny API)
LOVO_API_KEY = os.getenv("LOVO_API_KEY")
DEFAULT_SPEAKER_ID = os.getenv("DEFAULT_SPEAKER_ID", "")
LOVO_BASE = os.getenv("LOVO_BASE", "https://api.genny.lovo.ai/api/v1")

if not LOVO_API_KEY:
    print("Warning: LOVO_API_KEY is not set. TTS endpoints will be disabled until configured.")

# ElevenLabs
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY") or os.getenv("VITE_ELEVENLABS_API_KEY")
if not ELEVENLABS_API_KEY:
    print("Warning: ELEVENLABS_API_KEY is not set. ElevenLabs proxy will be disabled until configured.")

# Gemini API keys
# Prefer dedicated keys; fallback to generic and VITE_* keys if present in root .env
TRANSLATE_API_KEY = (
    os.getenv("GEMINI_TRANSLATE_API_KEY")
    or os.getenv("GEMINI_API_KEY")
    or os.getenv("GEMINI_TTS_API_KEY")
    or os.getenv("VITE_GEMINI_TTS_API_KEY")
    or os.getenv("VITE_GEMINI_API_KEY")
)
# Gemini TTS API Key(s)
GEMINI_TTS_API_KEY = (
    os.getenv("GEMINI_TTS_API_KEY")
    or os.getenv("GEMINI_API_KEY")
    or os.getenv("VITE_GEMINI_TTS_API_KEY")
    or os.getenv("VITE_GEMINI_API_KEY")
)
GEMINI_TTS_API_KEYS = [k.strip() for k in (os.getenv("GEMINI_TTS_API_KEYS") or "").split(",") if k.strip()]
if not GEMINI_TTS_API_KEYS and GEMINI_TTS_API_KEY:
    GEMINI_TTS_API_KEYS = [GEMINI_TTS_API_KEY]
_gemini_tts_key_index = 0

def _get_current_tts_key() -> str | None:
    global _gemini_tts_key_index
    if not GEMINI_TTS_API_KEYS:
        return None
    return GEMINI_TTS_API_KEYS[_gemini_tts_key_index % len(GEMINI_TTS_API_KEYS)]

def _advance_tts_key() -> None:
    global _gemini_tts_key_index
    if GEMINI_TTS_API_KEYS:
        _gemini_tts_key_index = (_gemini_tts_key_index + 1) % len(GEMINI_TTS_API_KEYS)

GEMINI_TTS_MODEL = os.getenv("GEMINI_TTS_MODEL", "gemini-2.5-flash-preview-tts")
GCP_USER_PROJECT = (
    os.getenv("GCP_PROJECT_NUMBER")
    or os.getenv("GOOGLE_CLOUD_PROJECT_NUMBER")
    or os.getenv("GCLOUD_PROJECT_NUMBER")
)

# Simple in-memory throttle for TTS calls to reduce 429s
_tts_backoff_until: float = 0.0
_last_tts_at: float = 0.0
# Slightly larger default gap to avoid rate limits under quick successive calls
MIN_TTS_GAP_S: float = float(os.getenv("GEMINI_TTS_MIN_GAP_MS", "900")) / 1000.0

async def _throttle_tts():
    global _tts_backoff_until, _last_tts_at
    now = time.monotonic()
    wait = 0.0
    # honor global backoff window if set
    if now < _tts_backoff_until:
        wait = max(wait, _tts_backoff_until - now)
    # enforce a minimum spacing between upstream calls
    gap = now - _last_tts_at
    if gap < MIN_TTS_GAP_S:
        wait = max(wait, MIN_TTS_GAP_S - gap)
    if wait > 0:
        try:
            await asyncio.sleep(wait)
        except Exception:
            pass
    _last_tts_at = time.monotonic()
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

app = FastAPI(title="NovEra Backend", version="1.1.1")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve local voice preview files, if configured
try:
    _voices_dir = os.getenv("VOICES_DIR")
    if _voices_dir and os.path.isdir(_voices_dir):
        app.mount("/voices", StaticFiles(directory=_voices_dir), name="voices")
except Exception:
    pass


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

class ElevenProxyRequest(BaseModel):
    text: str
    voice_id: Optional[str] = None
    stability: Optional[float] = 0.5
    similarity_boost: Optional[float] = 0.75
    style: Optional[float] = 0.0
    optimize_latency: Optional[int] = 4
    output_format: Optional[str] = "mp3_22050_32"


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
    text = sanitize_azeri_tts((req.text or "").strip())
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
        # Create client with API key and v1alpha for ephemeral auth tokens
        api_key = (
            GEMINI_TTS_API_KEY
            or os.getenv("GEMINI_API_KEY")
            or os.getenv("VITE_GEMINI_API_KEY")
        )
        client = genai_live.Client(api_key=api_key, http_options={"api_version": "v1alpha"})
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
    global _tts_backoff_until
    current_key = _get_current_tts_key()
    if not current_key:
        raise HTTPException(status_code=503, detail="Gemini TTS is not configured on the server.")

    text = (req.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="'text' is required")

    voice_name = (req.voice_name or "Kore").strip() or "Kore"
    sample_rate = int(req.sample_rate or 24000)
    channels = int(req.channels or 1)

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_TTS_MODEL}:generateContent"
    headers = {"x-goog-api-key": current_key, "Content-Type": "application/json"}
    payload: Dict[str, Any] = {
        "contents": [{"role": "user", "parts": [{"text": text}]}],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "responseMimeType": "audio/wav",
            "response_mime_type": "audio/wav",
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
            attempts = 0
            max_attempts = max(1, min(3, len(GEMINI_TTS_API_KEYS) if GEMINI_TTS_API_KEYS else 1))
            data = None
            while attempts < max_attempts:
                # throttle between calls
                try:
                    await _throttle_tts()
                except Exception:
                    pass
                resp = await client.post(url, headers=headers, json=payload)
                # Handle 429/503: rotate to next key and retry
                if resp.status_code in (429, 503):
                    # short global backoff to reduce hammering
                    try:
                        _tts_backoff_until = time.monotonic() + 3.5
                    except Exception:
                        pass
                    _advance_tts_key()
                    headers["x-goog-api-key"] = _get_current_tts_key() or ""
                    attempts += 1
                    continue
                # Handle 404: model not found for v1beta or not supported; try preview model explicitly
                if resp.status_code == 404:
                    try:
                        err_txt_404 = (resp.text or "").lower()
                    except Exception:
                        err_txt_404 = ""
                    alt_model = "gemini-2.5-flash-preview-tts"
                    alt_url = f"https://generativelanguage.googleapis.com/v1beta/models/{alt_model}:generateContent"
                    alt_payload_m = dict(payload)
                    alt_payload_m["model"] = alt_model
                    try:
                        await _throttle_tts()
                    except Exception:
                        pass
                    resp_m = await client.post(alt_url, headers=headers, json=alt_payload_m)
                    if resp_m.status_code in (429, 503):
                        try:
                            _tts_backoff_until = time.monotonic() + 3.5
                        except Exception:
                            pass
                        _advance_tts_key()
                        headers["x-goog-api-key"] = _get_current_tts_key() or ""
                        attempts += 1
                        continue
                    if resp_m.status_code >= 400:
                        raise HTTPException(status_code=resp_m.status_code, detail=f"Gemini TTS error: {resp_m.text}")
                    data = resp_m.json()
                    break
                if resp.status_code >= 400:
                    # Attempt a one-time safe fallback to Lira/Kore if voice unsupported
                    if resp.status_code == 400:
                        try:
                            err_txt = (resp.text or "").lower()
                        except Exception:
                            err_txt = ""
                        # Fallback A: if mime complaint, drop responseMimeType and retry
                        if ("allowed mimetypes" in err_txt) or ("response_mime_type" in err_txt) or ("responsemimetype" in err_txt):
                            alt_payload = dict(payload)
                            alt_gc = dict(alt_payload.get("generationConfig", {}))  # type: ignore
                            # try removing both variants
                            if "responseMimeType" in alt_gc:
                                alt_gc.pop("responseMimeType", None)
                            if "response_mime_type" in alt_gc:
                                alt_gc.pop("response_mime_type", None)
                            alt_payload["generationConfig"] = alt_gc
                            try:
                                await _throttle_tts()
                            except Exception:
                                pass
                            resp2 = await client.post(url, headers=headers, json=alt_payload)
                            if resp2.status_code in (429, 503):
                                try:
                                    _tts_backoff_until = time.monotonic() + 3.5
                                except Exception:
                                    pass
                                _advance_tts_key()
                                headers["x-goog-api-key"] = _get_current_tts_key() or ""
                                attempts += 1
                                continue
                            if resp2.status_code >= 400:
                                # Fallback B: try voice fallback to Lira/Kore (generationConfig.speechConfig)
                                female_set = {"Lira", "Sulafat", "Zephyr"}
                                fallback_voice = "Lira" if voice_name in female_set else "Kore"
                                alt_payload2 = dict(alt_payload)
                                alt_gc2 = dict(alt_payload2.get("generationConfig", {}))
                                alt_sc2 = dict(alt_gc2.get("speechConfig", {}))
                                alt_vc2 = dict(alt_sc2.get("voiceConfig", {}))
                                alt_pvc2 = dict(alt_vc2.get("prebuiltVoiceConfig", {}))
                                alt_pvc2["voiceName"] = fallback_voice
                                alt_vc2["prebuiltVoiceConfig"] = alt_pvc2
                                alt_sc2["voiceConfig"] = alt_vc2
                                alt_gc2["speechConfig"] = alt_sc2
                                alt_payload2["generationConfig"] = alt_gc2
                                try:
                                    await _throttle_tts()
                                except Exception:
                                    pass
                                resp3 = await client.post(url, headers=headers, json=alt_payload2)
                                if resp3.status_code in (429, 503):
                                    try:
                                        _tts_backoff_until = time.monotonic() + 3.5
                                    except Exception:
                                        pass
                                    _advance_tts_key()
                                    headers["x-goog-api-key"] = _get_current_tts_key() or ""
                                    attempts += 1
                                    continue
                                if resp3.status_code >= 400:
                                    raise HTTPException(status_code=resp3.status_code, detail=f"Gemini TTS error: {resp3.text}")
                                data = resp3.json()
                                break
                            else:
                                data = resp2.json()
                                break
                        else:
                            # Fallback: try voice change Lira/Kore (generationConfig.speechConfig)
                            female_set = {"Lira", "Sulafat", "Zephyr"}
                            fallback_voice = "Lira" if voice_name in female_set else "Kore"
                            alt_payload = dict(payload)
                            alt_gc = dict(alt_payload.get("generationConfig", {}))  # type: ignore
                            alt_sc = dict(alt_gc.get("speechConfig", {}))
                            alt_vc = dict(alt_sc.get("voiceConfig", {}))
                            alt_pvc = dict(alt_vc.get("prebuiltVoiceConfig", {}))
                            alt_pvc["voiceName"] = fallback_voice
                            alt_vc["prebuiltVoiceConfig"] = alt_pvc
                            alt_sc["voiceConfig"] = alt_vc
                            alt_gc["speechConfig"] = alt_sc
                            alt_payload["generationConfig"] = alt_gc
                            try:
                                await _throttle_tts()
                            except Exception:
                                pass
                            resp2 = await client.post(url, headers=headers, json=alt_payload)
                            if resp2.status_code == 429:
                                try:
                                    _tts_backoff_until = time.monotonic() + 3.5
                                except Exception:
                                    pass
                                _advance_tts_key()
                                headers["x-goog-api-key"] = _get_current_tts_key() or ""
                                attempts += 1
                                continue
                            if resp2.status_code >= 400:
                                raise HTTPException(status_code=resp2.status_code, detail=f"Gemini TTS error: {resp2.text}")
                            data = resp2.json()
                            break
                    else:
                        raise HTTPException(status_code=resp.status_code, detail=f"Gemini TTS error: {resp.text}")
                else:
                    data = resp.json()
                    break
            if data is None:
                raise HTTPException(status_code=429, detail="Gemini TTS rate limited across configured keys")

        # Extract inline audio and its mimeType
        try:
            parts = (
                data.get("candidates", [{}])[0]
                .get("content", {})
                .get("parts", [])
            ) or []
            inline = None
            for p in parts:
                if isinstance(p, dict) and (p.get("inlineData") or p.get("inline_data")):
                    inline = p.get("inlineData") or p.get("inline_data")
                    break
            if not inline:
                raise Exception("no inlineData part")
            mime = inline.get("mimeType") or inline.get("mime_type") or "audio/wav"
            b64 = inline.get("data")
        except Exception:
            mime = None
            b64 = None

        if not b64 or not isinstance(b64, str):
            raise HTTPException(status_code=502, detail="Gemini TTS returned no audio data")

        try:
            audio_bytes = base64.b64decode(b64)
        except Exception:
            raise HTTPException(status_code=502, detail="Failed to decode Gemini TTS audio data")

        # If inline is raw PCM/L16/RAW or mime is missing, wrap to WAV; else return original format
        mime_l = (mime or "").lower()
        if (not mime) or ("pcm" in mime_l) or ("l16" in mime_l) or ("raw" in mime_l):
            wav_bytes = pcm_to_wav_bytes(audio_bytes, channels=channels, rate=sample_rate, sample_width=2)
            if format == "base64":
                return JSONResponse({"audio_base64": base64.b64encode(wav_bytes).decode("utf-8"), "mimeType": "audio/wav"})
            return Response(content=wav_bytes, media_type="audio/wav", headers={"Cache-Control": "no-store"})
        else:
            # Return as-is with the provided mime type (e.g., audio/wav, audio/mpeg, audio/ogg)
            if format == "base64":
                return JSONResponse({"audio_base64": base64.b64encode(audio_bytes).decode("utf-8"), "mimeType": mime or "audio/wav"})
            return Response(content=audio_bytes, media_type=mime or "audio/wav", headers={"Cache-Control": "no-store"})
    except HTTPException:
        raise
    except Exception as e:
        print(f"Gemini TTS exception: {e}")
        raise HTTPException(status_code=502, detail="Failed to synthesize speech with Gemini API.")


@app.get("/api/gemini-tts-test")
async def gemini_tts_test(
    text: str = Query(..., description="Text to synthesize"),
    voice_name: str = Query("Kore", description="Prebuilt voice name (e.g., Gacrux, Fenrir, Sulafat, Zephyr, Charon, Puck)"),
    format: str = Query("binary", pattern="^(binary|base64)$"),
):
    """Convenience endpoint to test Gemini TTS via query params.

    Example:
      GET /api/gemini-tts-test?text=Salam&voice_name=Sulafat
    """
    req = GeminiTTSRequest(text=text, voice_name=voice_name, sample_rate=24000, channels=1)
    return await gemini_tts(req, format)  # type: ignore

@app.post("/api/elevenlabs-proxy")
async def elevenlabs_proxy(req: ElevenProxyRequest):
    """Proxy ElevenLabs TTS via server (avoids CORS and hides key).

    Prefers streaming endpoint for lower latency, falls back to standard endpoint.
    """
    key = os.getenv("ELEVENLABS_API_KEY") or os.getenv("VITE_ELEVENLABS_API_KEY")
    if not key:
        raise HTTPException(status_code=503, detail="ElevenLabs is not configured on the server.")

    text = (req.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="'text' is required")
    voice_id = (req.voice_id or "").strip() or "TX3LPaxmHKxFdv7VOQHJ"
    raw_stability = max(0.0, min(1.0, float(req.stability or 0.5)))
    # eleven_v3 supports only 0.0, 0.5, 1.0
    if raw_stability <= 0.25:
        stability = 0.0
    elif raw_stability <= 0.75:
        stability = 0.5
    else:
        stability = 1.0
    similarity = max(0.0, min(1.0, float(req.similarity_boost or 0.75)))
    style = max(0.0, min(1.0, float(req.style or 0.0)))
    optimize = int(req.optimize_latency or 4)
    output_fmt = (req.output_format or "mp3_22050_32").strip()

    base = "https://api.elevenlabs.io/v1"
    headers = {
        "Accept": "audio/mpeg",
        "Content-Type": "application/json",
        "xi-api-key": key,
    }
    body = {
        "text": text,
        "model_id": "eleven_v3",
        "voice_settings": {
            "stability": stability,
            "similarity_boost": similarity,
            "style": style,
            "use_speaker_boost": True,
        },
    }

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(60.0)) as client:
            # try streaming endpoint first
            stream_url = f"{base}/text-to-speech/{voice_id}/stream?output_format={output_fmt}"
            resp = await client.post(stream_url, headers=headers, json=body)
            if resp.status_code >= 400:
                # fallback to standard endpoint
                std_url = f"{base}/text-to-speech/{voice_id}"
                resp2 = await client.post(std_url, headers=headers, json=body)
                if resp2.status_code >= 400:
                    raise HTTPException(status_code=resp2.status_code, detail=f"ElevenLabs error: {resp2.text}")
                return Response(content=resp2.content, media_type="audio/mpeg", headers={"Cache-Control": "no-store"})
            return Response(content=resp.content, media_type="audio/mpeg", headers={"Cache-Control": "no-store"})
    except HTTPException:
        raise
    except Exception as e:
        print(f"ElevenLabs proxy exception: {e}")
        raise HTTPException(status_code=502, detail="Failed to synthesize speech with ElevenLabs API.")
