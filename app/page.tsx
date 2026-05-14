"use client";
import { useState } from "react";

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);

  const handleAsk = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setResponse("");
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (data.error) {
        setResponse("Error: " + data.error);
      } else {
        setResponse(data.text);
      }
    } catch (err: any) {
      setResponse("Error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "2rem", maxWidth: "600px", margin: "0 auto", fontFamily: "sans-serif" }}>
      <h1 style={{ marginBottom: "1.5rem" }}>NovEra AI Chat</h1>
      <textarea
        style={{
          width: "100%",
          height: "150px",
          padding: "1rem",
          borderRadius: "8px",
          border: "1px solid #ccc",
          marginBottom: "1rem",
          fontSize: "1rem"
        }}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Sualını yaz..."
      />
      <button 
        style={{
          padding: "0.75rem 1.5rem",
          borderRadius: "8px",
          border: "none",
          backgroundColor: "#0070f3",
          color: "white",
          fontSize: "1rem",
          cursor: loading ? "not-allowed" : "pointer"
        }}
        onClick={handleAsk} 
        disabled={loading}
      >
        {loading ? "Gözlə..." : "Göndər"}
      </button>
      
      {response && (
        <div style={{ marginTop: "2rem", padding: "1rem", backgroundColor: "#f0f0f0", borderRadius: "8px" }}>
          <h3>Cavab:</h3>
          <p style={{ whiteSpace: "pre-wrap" }}>{response}</p>
        </div>
      )}
    </div>
  );
}
