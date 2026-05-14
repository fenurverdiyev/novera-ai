import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
dotenv.config({ path: "d:/NovEra/NovEra/.env.local" });

const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

console.log("ai properties:", Object.keys(ai));
if (ai.models) {
    console.log("ai.models properties:", Object.keys(ai.models));
}
