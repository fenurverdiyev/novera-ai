import { GoogleGenAI } from "@google/genai";

const getCredentials = () => {
  if (process.env.GOOGLE_SA_JSON) {
    try {
      return JSON.parse(process.env.GOOGLE_SA_JSON);
    } catch (e) {
      console.error("Error parsing GOOGLE_SA_JSON:", e);
    }
  }
  return null;
};

const credentials = getCredentials();

export const ai = new GoogleGenAI({
  vertexai: true,
  project: process.env.GOOGLE_CLOUD_PROJECT || "novera-495614",
  location: process.env.GOOGLE_CLOUD_LOCATION || "us-central1",
  googleAuthOptions: {
    credentials: credentials || undefined,
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  },
});
