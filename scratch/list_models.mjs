import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
dotenv.config({ path: "d:/NovEra/NovEra/.env.local" });

const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

async function run() {
    try {
        const models = await ai.models.list();
        console.log("Available models:");
        for (const m of models) {
            console.log(m.name);
        }
    } catch (e) {
        console.error("Error listing models:", e.message);
    }
}

run();
