import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
dotenv.config({ path: "d:/NovEra/NovEra/.env.local" });

const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

async function testModel(modelName) {
    console.log(`Testing model: ${modelName}`);
    try {
        // Matching the pattern in geminiService.ts
        const resp = await ai.models.generateContent({
            model: modelName,
            contents: [{ role: 'user', parts: [{ text: "Hi" }] }]
        });
        console.log(`Success for ${modelName}:`, resp.text);
        return true;
    } catch (e) {
        console.error(`Error for ${modelName}:`, e.message);
        return false;
    }
}

async function run() {
    await testModel('gemini-3.1-flash-lite-preview');
    await testModel('gemini-2.0-flash-lite-preview-09-2025');
    await testModel('gemini-1.5-flash');
}

run();
