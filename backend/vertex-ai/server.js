/**
 * NovEra Vertex AI Backend — server.js (Modernized 2026)
 * Port: 8020
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');
const distPath = path.join(__dirname, '../../dist');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ─── Credentials ─────────────────────────────────────────────────────────────
function loadCredentials() {
  // 1. Priority: GOOGLE_SA_JSON environment variable
  if (process.env.GOOGLE_SA_JSON) {
    try {
      let jsonStr = process.env.GOOGLE_SA_JSON;
      // Əgər dəyər dırnaq içindədirsə, dırnaqları sil (Render xətası üçün)
      if (jsonStr.startsWith('"') && jsonStr.endsWith('"')) {
        jsonStr = jsonStr.slice(1, -1).replace(/\\"/g, '"');
      }
      
      const parsed = JSON.parse(jsonStr);
      // Private key-dəki sətir atlamalarını düzəlt
      if (parsed.private_key) {
        parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
      }
      return parsed;
    } catch (e) {
      console.error('❌ GOOGLE_SA_JSON parse error:', e.message);
    }
  }

  // 2. Fallback: Local JSON files
  const candidates = [
    path.join(__dirname, 'service-account.json'),
    path.join(__dirname, 'credentials.json'),
    path.join(__dirname, '../../credentials.json'),
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
  ].filter(Boolean);

  for (const c of candidates) {
    const fullPath = path.resolve(c);
    if (fs.existsSync(fullPath)) {
      try {
        return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      } catch (e) {
        console.error(`❌ Error reading ${fullPath}:`, e.message);
      }
    }
  }
  
  return null;
}

const credentials = loadCredentials();
if (credentials) {
  console.log(`✅ AI Credentials loaded for: ${credentials.client_email}`);
} else {
  console.warn('⚠️ No Service Account credentials found. Falling back to default auth (if available).');
}

// ─── AI Client ────────────────────────────────────────────────────────────────
const ai = new GoogleGenAI({
  vertexai: true,
  project: process.env.GOOGLE_CLOUD_PROJECT || 'novera-495614',
  location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
  googleAuthOptions: credentials ? {
    credentials,
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  } : undefined,
});

const MODELS = {
  flash:     'gemini-2.5-flash',       // Balanced (Default)
  pro:       'gemini-2.5-pro',          // Advanced Reasoning
  flashLite: 'gemini-2.5-flash-lite',  // High speed, low latency
};

const DEFAULT_SYSTEM_INSTRUCTION = [
  'Sən NovEra AI assistantsan. NovEra Group tərəfindən yaradılmısan.',
  'Həmişə istifadəçinin dilində cavab ver.',
  'Sizdən kim olduğunuz soruşulduqda: "Mən NovEra-yam, NovEra Group tərəfindən yaradılmışam" de.',
  'Qısa və dəqiq ol.',
];

// ─── Express Setup ───────────────────────────────────────────────────────────
const app = express();
const port = process.env.PORT || 8020;
const JWT_SECRET = process.env.JWT_SECRET || 'novera_secret_key_2026';
const oauthClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.static(distPath));

// Logging Middleware
app.use((req, res, next) => {
  if (req.url !== '/api/health') {
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
  }
  next();
});

// Auth Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token missing' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token invalid' });
    req.user = user;
    next();
  });
};

// ─── API Routes ──────────────────────────────────────────────────────────────

// 1. Simple Generate Content
app.post('/api/ask', async (req, res) => {
  try {
    const {
      prompt,
      systemInstruction,
      model = MODELS.flash,
      temperature = 0.7,
      maxOutputTokens = 4096,
    } = req.body;

    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction: systemInstruction || DEFAULT_SYSTEM_INSTRUCTION,
        temperature,
        maxOutputTokens,
      },
    });

    res.json({ text: response.text?.trim() || '' });
  } catch (error) {
    console.error('Ask Error:', error);
    res.status(error.status || 500).json({ error: error.message });
  }
});

// 2. Streaming Chat (SSE)
app.post('/api/chat-stream', async (req, res) => {
  try {
    const {
      contents,
      systemInstruction,
      model = MODELS.flash,
      generationConfig = {},
    } = req.body;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const stream = await ai.models.generateContentStream({
      model,
      contents,
      config: {
        tools: [{ googleSearch: {} }], // Always enable grounding for stream if needed
        systemInstruction: systemInstruction || DEFAULT_SYSTEM_INSTRUCTION,
        temperature: generationConfig.temperature ?? 0.7,
        maxOutputTokens: generationConfig.maxOutputTokens ?? 4096,
        topP: generationConfig.topP ?? 0.9,
      },
    });

    for await (const chunk of stream) {
      const data = {
        text: chunk.text ?? '',
        groundingMetadata: chunk.candidates?.[0]?.groundingMetadata ?? null,
      };
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    console.error('Stream Error:', error);
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});

// 3. Multi-turn Chat (Non-streaming fallback)
app.post('/api/chat', async (req, res) => {
  try {
    const {
      message,
      history = [],
      systemInstruction,
      model = MODELS.flash,
    } = req.body;

    const contents = [
      ...history.map(h => ({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.text || h.content || '' }]
      })),
      { role: 'user', parts: [{ text: message }] }
    ];

    const response = await ai.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction: systemInstruction || DEFAULT_SYSTEM_INSTRUCTION,
      },
    });

    res.json({ text: response.text });
  } catch (error) {
    console.error('Chat Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 4. Authentication (Unified)
app.post('/api/auth/google', async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: 'Credential missing' });

    let payload;
    try {
      const ticket = await oauthClient.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch (e) {
      // Dev mode fallback for manual decode if no client ID
      const parts = credential.split('.');
      if (parts.length === 3) {
        payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      } else {
        throw e;
      }
    }

    const user = {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
    };

    const token = jwt.sign(user, JWT_SECRET, { expiresIn: '30d' });
    res.json({ user, token });
  } catch (error) {
    console.error('Auth Error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
});

// 5. History Management
app.post('/api/history/save', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id || req.user.email;
    const filePath = path.join(DATA_DIR, `history_${userId.replace(/[^a-z0-9]/gi, '_')}.json`);
    fs.writeFileSync(filePath, JSON.stringify({ userId, ...req.body }, null, 2));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save history' });
  }
});

app.get('/api/history/load', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id || req.user.email;
    const filePath = path.join(DATA_DIR, `history_${userId.replace(/[^a-z0-9]/gi, '_')}.json`);
    if (fs.existsSync(filePath)) {
      res.json(JSON.parse(fs.readFileSync(filePath, 'utf8')));
    } else {
      res.json({ history: [] });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to load history' });
  }
});

// 6. Gemini TTS (Grounded)
app.post('/api/gemini-tts', async (req, res) => {
  try {
    const { text, voice_name = 'Kore' } = req.body;
    if (!text) return res.status(400).json({ error: 'Text required' });

    const response = await ai.models.generateContent({
      model: MODELS.flash,
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voice_name }
          }
        }
      }
    });

    const audioPart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    if (!audioPart?.inlineData?.data) {
      return res.status(500).json({ error: 'No audio data returned from Gemini' });
    }

    const pcmBytes = Buffer.from(audioPart.inlineData.data, 'base64');
    
    // Wrap in WAV header if not already
    if (audioPart.inlineData.mimeType?.includes('wav')) {
      res.set('Content-Type', 'audio/wav');
      return res.send(pcmBytes);
    }

    // PCM to WAV wrapper
    const sampleRate = 24000, channels = 1, bits = 16;
    const header = Buffer.alloc(44);
    header.write('RIFF', 0); header.writeUInt32LE(36 + pcmBytes.length, 4);
    header.write('WAVE', 8); header.write('fmt ', 12);
    header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20);
    header.writeUInt16LE(channels, 22); header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * channels * bits / 8, 28);
    header.writeUInt16LE(channels * bits / 8, 32); header.writeUInt16LE(bits, 34);
    header.write('data', 36); header.writeUInt32LE(pcmBytes.length, 40);

    res.set('Content-Type', 'audio/wav');
    res.send(Buffer.concat([header, pcmBytes]));
  } catch (error) {
    console.error('TTS Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 7. Translation (Backend-side)
app.post('/api/translate', async (req, res) => {
  try {
    const { text, target_language } = req.body;
    if (!text || !target_language) return res.status(400).json({ error: 'Text and target_language required' });

    const prompt = `Translate the following text to ${target_language}. Return ONLY the translated text without any commentary.\n\nText: ${text}`;
    
    const response = await ai.models.generateContent({
      model: MODELS.flashLite,
      contents: prompt,
      config: { temperature: 0.1 },
    });

    res.json({ translated_text: response.text?.trim() || text });
  } catch (error) {
    console.error('Translation Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 8. Health & Info
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '2.5',
    project: process.env.GOOGLE_CLOUD_PROJECT,
    model: MODELS.flash,
    time: new Date().toISOString()
  });
});

// SPA Fallback
app.get('*', (req, res) => {
  const indexPath = path.join(distPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.status(404).send('Build not found. Run `npm run build`.');
});

// ─── Start Server ───────────────────────────────────────────────────────────
app.listen(port, '0.0.0.0', () => {
  console.log(`\n🚀 NovEra Vertex AI Server running on port ${port}`);
  console.log(`📡 Endpoints: /api/ask, /api/chat-stream, /api/auth/google, /api/gemini-tts`);
  console.log(`🛠️ Mode: ${process.env.NODE_ENV || 'development'}\n`);
});
