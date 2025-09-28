# NovEra FastAPI TTS Backend (LOVO.ai Genny)

Bu servis frontend-də API açarını gizli saxlamaq üçün LOVO.ai (Genny) TTS çağırışlarını server tərəfdə icra edir.

## Endpoints

- POST `/api/tts?format=binary|base64`
  - Body: `{ text: string, voice_id?: string, model_id?: string, voice_settings?: object, output_format?: string }`
  - Returns: `audio/mpeg` (binary) or `{ audio_base64: string }`
- GET `/api/tts/stream?text=...&voice_id=...`
  - Streams `audio/mpeg` suitable for `<audio src="..."/>`
- GET `/api/voices`
  - Returns: `{ voices: { id: string; name: string; category: string; gender?: 'male'|'female'|string }[], recommended?: string[] }`

## Quraşdırma

1) Create a virtual env (Windows PowerShell)
```
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

2) Install dependencies
```
pip install -r requirements.txt
```

3) Mühit dəyişənlərini konfiqurasiya edin

- `.env.example` faylını `.env` kimi kopyalayın və LOVO açarınızı əlavə edin
```
copy .env.example .env
```
- Edit `.env`:
```
LOVO_API_KEY=your_lovo_genny_api_key_here
DEFAULT_SPEAKER_ID=your_default_speaker_id   # (opsional) /api/voices ilə tapa bilərsiniz
ALLOWED_ORIGINS=http://localhost:5175,http://localhost:5173
```

4) Serveri işə salın
```
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

## Frontend istifadəsi

React tətbiqinə backend URL-ni bildirmək üçün Vite env dəyişənini təyin edin:
```
VITE_TTS_BACKEND_URL=http://localhost:8001
```

### Tövsiyə olunan səslər

Backend `RECOMMENDED_SPEAKER_IDS` mühit dəyişəni ilə UI-də öndə göstəriləcək səsləri təyin edə bilərsiniz:
```
RECOMMENDED_SPEAKER_IDS=female_id_1,female_id_2,male_id_1,male_id_2
```
Əgər təyin etməsəniz, backend `gender` metadata-sı mövcuddursa avtomatik olaraq ilk 2 qadın + 2 kişi səsini seçəcək.

### cURL examples

- Binary response
```
curl -X POST "http://localhost:8001/api/tts" ^
  -H "Content-Type: application/json" ^
  -d "{\"text\":\"Salam dünya\"}" --output out.mp3
```

- Base64 response
```
curl -X POST "http://localhost:8001/api/tts?format=base64" ^
  -H "Content-Type: application/json" ^
  -d "{\"text\":\"Salam dünya\"}"
```

- Streaming playback URL
```
http://localhost:8001/api/tts/stream?text=Salam%20d%C3%BCnya
```

## Notes

- LOVO API açarınızı yalnız serverdə saxlayın (frontend-ə qoymayın).
- Production mühitində `ALLOWED_ORIGINS` dəyərini saytınızla məhdudlaşdırın.
- `DEFAULT_SPEAKER_ID` boş qalarsa, sorğuda `voice_id` göndərin.

## Troubleshooting

- **Failed to fetch (Frontend VoiceSelect)**
  - Backend işlədiyinə əmin olun: `http://localhost:8001/docs`
  - `VITE_TTS_BACKEND_URL` dəyərini `.env`-də təyin etdikdən sonra Vite-i yenidən başladın
  - `ALLOWED_ORIGINS` daxilində sizin dev host+port var (məs: `http://localhost:5175`)
  - `LOVO_API_KEY` `.env`-də mövcuddur
