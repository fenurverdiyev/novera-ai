import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import { Mistral } from "@mistralai/mistralai";
import dotenv from "dotenv";

dotenv.config();

const client = new Mistral({
  apiKey: process.env.MISTRAL_API_KEY
});

const app = express();
app.use(express.json());
app.use(cors()); // Allow frontend to call this API

// Brauzerdən daxil olanda "Cannot GET /" xətası görməmək üçün sadə məlumat səhifəsi
app.get("/", (req, res) => {
  res.send("<h1>🔥 Ollama Backend Server işləyir!</h1><p>Endpointlər: POST /chat və POST /chat/stream</p>");
});

app.post("/chat", async (req, res) => {
  try {
    const { messages, model = "batiai/gemma4-e4b:q4" } = req.body;

    const response = await fetch("http://localhost:11434/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        stream: false,
        options: {
          think: false
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ error: errorText });
    }

    const data = await response.json();
    res.json(data);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Stream API endpoint (Universe rejimi üçün)
app.post("/chat/stream", async (req, res) => {
  try {
    const { messages, model = "batiai/gemma4-e4b:q4", temperature = 0.7, top_p = 0.9 } = req.body;

    const response = await fetch("http://localhost:11434/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        stream: true,
        options: {
          think: false,
          temperature,
          top_p
        }
      })
    });

    res.setHeader("Content-Type", "application/x-ndjson");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    response.body.on("data", (chunk) => {
      res.write(chunk);
      // Express flush if available
      if (typeof res.flush === "function") {
        res.flush();
      }
    });

    response.body.on("end", () => {
      res.end();
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/chat/mistral", async (req, res) => {
  try {
    const { messages } = req.body;

    const response = await client.chat.complete({
      model: "mistral-large-latest",
      messages: messages,
    });

    res.json({
      reply: response.choices[0].message.content,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(3000, () => {
  console.log("🔥 Ollama Backend Server işləyir: http://localhost:3000");
});
