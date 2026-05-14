import { ai } from "@/lib/vertex";

export async function POST(req: Request) {
  try {
    const { prompt, model = "gemini-2.5-flash" } = await req.json();

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const genStream = await ai.models.generateContentStream({
            model,
            contents: prompt,
          });

          for await (const chunk of genStream) {
            const text = chunk.text ?? "";
            controller.enqueue(encoder.encode(text));
          }
          controller.close();
        } catch (error: any) {
          console.error("Stream Start Error:", error);
          controller.error(error);
        }
      },
    });

    return new Response(stream, {
      headers: { 
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      },
    });
  } catch (error: any) {
    console.error("Chat API Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
