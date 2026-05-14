import { NextRequest, NextResponse } from "next/server";
import { ai } from "@/lib/vertex";

export async function POST(req: NextRequest) {
  try {
    const { prompt, systemInstruction, model = "gemini-2.5-flash" } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: systemInstruction
        ? { systemInstruction: [systemInstruction] }
        : undefined,
    });

    return NextResponse.json({ text: response.text });
  } catch (error: any) {
    console.error("Ask API Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
