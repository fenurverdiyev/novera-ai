import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
dotenv.config({ path: "d:/NovEra/NovEra/.env.local" });

const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const googleSearchTool = { googleSearch: {} };

async function testGrounding(modelName) {
    console.log(`Testing grounding for ${modelName}...`);
    try {
        const resp = await ai.models.generateContent({
            model: modelName,
            contents: [{ role: 'user', parts: [{ text: "Who won the game yesterday?" }] }],
            config: {
                tools: [googleSearchTool]
            }
        });
        console.log(`Success for ${modelName} with grounding!`);
        return true;
    } catch (e) {
        console.error(`Error for ${modelName} with grounding:`, e.message);
        return false;
    }
}

async function run() {
    await testGrounding('gemini-3.1-flash-lite-preview');
    await testGrounding('gemini-1.5-flash');
}

run();
