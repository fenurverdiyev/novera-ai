import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const credentials = JSON.parse(fs.readFileSync("./credentials.json", "utf8"));

const ai = new GoogleGenAI({
  vertexai: true,
  project: "novera-495614",
  location: "us-central1",
  googleAuthOptions: {
    credentials,
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  },
});

async function test() {
  try {
    console.log("Testing with gemini-2.5-flash...");
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: "Salam, sən kimsən?",
    });
    console.log("Response:", response.text);
  } catch (error) {
    console.error("Error status:", error.status);
    console.error("Error message:", error.message);
  }
}

test();
