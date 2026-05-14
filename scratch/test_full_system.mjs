import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
dotenv.config({ path: "d:/NovEra/NovEra/.env.local" });

const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const baseInstruction = `Sizin adınız NovEra-dır. Siz NovEra Group tərəfindən yaradılmış çoxdilli süni intellekt köməkçisisisisiniz. Həmişə istifadəçinin son mesajının dilində cavab verin. İstifadəçinin dili aydın deyilsə, brauzerin dilində (navigator.language) cavab verin. Sizdən kim olduğunuz və ya sizi kimin yaratdığı soruşulduqda, həmişə "Mən NovEra-yam, NovEra Group tərəfindən yaradılmışam" deyə cavab verməlisiniz.`;
const systemInstruction = baseInstruction + 
    "When the user wants to see EXISTING images or videos (e.g., 'meşə şəkli tap', 'show me a car'), you MUST use the `webSearch` tool. " +
    "When the user wants to CREATE or GENERATE a NEW image from a description (e.g., 'şəkil yarat', 'imagine a...', 'create an image of...'), you MUST use the `generateImage` tool using Pollinations AI. " +
    "CRITICAL: If the user says 'şəkil yarat' or similar generative intent, DO NOT use `webSearch`. Use ONLY `generateImage`. " +
    "IMPORTANT: For `generateImage`, always use an English prompt for the best results. Translate the user's request to a detailed English prompt." +
    "If the user asks to see a location on a map or provides an address, call `showMap` tool. " +
    "Do not comment on visual content or maps without using the relevant tool.";

async function run() {
    console.log("Testing with full system instruction...");
    try {
        const resp = await ai.models.generateContent({
            model: 'gemini-3.1-flash-lite-preview',
            contents: [{ role: 'user', parts: [{ text: "Salam" }] }],
            config: { systemInstruction }
        });
        console.log("Success:", resp.text);
    } catch (e) {
        console.error("Error:", e.message);
    }
}

run();
