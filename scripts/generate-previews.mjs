import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
if (!ELEVENLABS_API_KEY) {
  console.error('ELEVENLABS_API_KEY env is missing. Set it, then re-run.');
  process.exit(1);
}

const TEXT = 'Salam mən NovEra sizə necə kömək edə bilərəm.';

// Internal voice -> ElevenLabs voice ID + output filenames
const VOICES = [
  { internal: 'Gacrux',  char: 'kamran', fileVoice: 'Gacrux',  eleven: 'ErXwobaYiN019PkySvjV' }, // Antoni (mature male)
  { internal: 'Fenrir',  char: 'salim',  fileVoice: 'Fenrir',  eleven: 'yoZ06aMxZJJ28mfd3POQ' }, // Sam (energetic male)
  { internal: 'Sulafat', char: 'arzu',   fileVoice: 'Sulafat', eleven: 'TX3LPaxmHKxFdv7VOQHJ' }, // Bella (warm female)
  { internal: 'Zephyr',  char: 'leyla',  fileVoice: 'Zephyr',  eleven: 'EXAVITQu4vr4xnSDxMaL' }, // Bella alt (bright female)
  { internal: 'Charon',  char: 'ilkin',  fileVoice: 'Charon',  eleven: 'pNInz6obpgDQGcFmaJgB' }, // Adam (neutral male)
  { internal: 'Puck',    char: 'ferid',  fileVoice: 'Puck',    eleven: 'VR6AewLTigWG4xSOukaG' }, // Arnold (upbeat male)
];

const OUT_DIR = new URL('../public/voices/', import.meta.url);

async function ensureDir(pathUrl) {
  const path = pathUrl.pathname.replace(/^\//, '');
  if (!existsSync(path)) {
    await mkdir(path, { recursive: true });
  }
}

async function generateOne(v) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${v.eleven}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Accept': 'audio/mpeg',
      'Content-Type': 'application/json',
      'xi-api-key': ELEVENLABS_API_KEY,
    },
    body: JSON.stringify({
      text: TEXT,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true },
    }),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    throw new Error(`ElevenLabs failed for ${v.internal}: ${resp.status} ${t}`);
  }
  const outChar = new URL(`${v.char}.mp3`, OUT_DIR);
  const outVoice = new URL(`${v.fileVoice}.mp3`, OUT_DIR);
  const buf = Buffer.from(await resp.arrayBuffer());
  await writeFile(outChar, buf);
  await writeFile(outVoice, buf);
  return { char: outChar.pathname, voice: outVoice.pathname };
}

(async () => {
  try {
    await ensureDir(OUT_DIR);
    console.log('Generating previews to', OUT_DIR.pathname);
    for (const v of VOICES) {
      process.stdout.write(`→ ${v.internal} (${v.char}) ... `);
      const files = await generateOne(v);
      console.log('ok:', files.char.split('/').pop(), 'and', files.voice.split('/').pop());
    }
    console.log('All previews generated successfully.');
  } catch (e) {
    console.error('Generation failed:', e);
    process.exit(2);
  }
})();
