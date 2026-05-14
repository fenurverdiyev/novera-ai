import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

const API_KEY = process.env.MUSIC_API_KEY || "8cfa24ada25fa1c84e529525ac5b133a";

// 1. MUSIC GENERATE
app.post("/music/generate", async (req, res) => {
  try {
    const { prompt } = req.body;

    const response = await axios.post(
      "https://api.musicapi.ai/api/v1/studio/create",
      {
        prompt,
        lyrics_type: "generate"
      },
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    res.json(response.data);
  } catch (error: any) {
    res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
  }
});

// 2. TASK STATUS
app.get("/music/status/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const response = await axios.get(
      `https://api.musicapi.ai/api/v1/studio/task/${id}`,
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`
        }
      }
    );

    res.json(response.data);
  } catch (error: any) {
    res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Music API Backend running on http://localhost:${PORT}`);
});
