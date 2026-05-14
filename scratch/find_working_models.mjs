import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
dotenv.config({ path: "d:/NovEra/NovEra/.env.local" });

const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

async function testModel(modelName) {
    try {
        await ai.models.generateContent({
            model: modelName,
            contents: [{ role: 'user', parts: [{ text: "Hi" }] }]
        });
        return true;
    } catch (e) {
        return false;
    }
}

async function run() {
    const candidates = [
        'gemini-1.5-flash',
        'gemini-1.5-flash-latest',
        'gemini-1.5-flash-001',
        'gemini-1.5-flash-002',
        'gemini-1.5-pro',
        'gemini-2.0-flash',
        'gemini-2.0-flash-lite-preview',
        'gemini-3-flash',
        'gemini-3.1-flash-lite-preview', 'gemini-2.5-flash-lite', 'gemini-2.0-flash-lite-preview-02-05', 'gemini-2.5-flash'
    ];
    console.log("Checking model availability...");
    for (const c of candidates) {
        const ok = await testModel(c);
        console.log(`${c}: ${ok ? 'OK' : 'FAIL'}`);
    }
}

run();

