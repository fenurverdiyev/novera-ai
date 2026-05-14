import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
const model = 'gemini-3.1-flash-lite-preview';

async function test() {
    try {
        const resp = await ai.models.generateContent({
            model: model,
            contents: [{ role: 'user', parts: [{ text: "Hello" }] }]
        });
        console.log("Success:", resp.text);
    } catch (e) {
        console.error("Error:", e);
    }
}

test();





