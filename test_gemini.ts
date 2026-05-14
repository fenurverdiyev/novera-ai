import { GoogleGenAI } from "@google/genai";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const ai = new GoogleGenAI({ apiKey: process.env.VITE_GEMINI_API_KEY });

async function run() {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents: "hello",
      config: {
        tools: [
          {
            googleSearchRetrieval: {
              dynamicRetrievalConfig: {
                mode: "DYNAMIC",
                dynamicThreshold: 0.3,
              },
            },
          },
        ],
      },
    });
    console.log(response.text);
  } catch (e) {
    console.error(e);
  }
}

run();
