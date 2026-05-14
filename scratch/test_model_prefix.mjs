import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
dotenv.config({ path: "d:/NovEra/NovEra/.env.local" });

const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

async function testModel(modelName) {
    try {
        const resp = await ai.models.generateContent({
            model: modelName,
            contents: [{ role: 'user', parts: [{ text: "Hi" }] }]
        });
        console.log(`${modelName}: OK`);
        return true;
    } catch (e) {
        console.log(`${modelName}: FAIL (${e.message})`);
        return false;
    }
}

async function run() {
    const candidates = [
        'models/gemini-1.5-flash',
        'models/gemini-1.5-pro',
        'models/gemini-2.0-flash-exp',
        'models/gemini-2.0-flash',
        'gemini-1.5-flash',
        'gemini-2.0-flash'
    ];
    for (const c of candidates) {
        await testModel(c);
    }
}

run();
