import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
dotenv.config({ path: "d:/NovEra/NovEra/.env.local" });

const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const assistantTools = [
  {
    functionDeclarations: [
      {
        name: 'webSearch',
        description: 'Vebdə şəkil və videoları tapmaq üçün axtarış aparır.',
        parameters: {
          type: "OBJECT",
          properties: {
            query: { type: "STRING" },
          },
          required: ['query'],
        },
      },
    ],
  },
];

async function testModelComplex(modelName) {
    console.log(`Testing model with config: ${modelName}`);
    try {
        const resp = await ai.models.generateContent({
            model: modelName,
            contents: [{ role: 'user', parts: [{ text: "Hi" }] }],
            config: { 
                systemInstruction: "You are NovEra.",
                tools: assistantTools 
            }
        });
        console.log(`Success for ${modelName}:`, resp.text);
        return true;
    } catch (e) {
        console.error(`Error for ${modelName}:`, e.message);
        return false;
    }
}

async function run() {
    await testModelComplex('gemini-3.1-flash-lite-preview');
}

run();
