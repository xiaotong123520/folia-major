const SYSTEM_PROMPT = `You are Folia's music radio curator. Interpret the user's mood and return only valid JSON with this exact schema:
{"title":"short Chinese radio title","mood":"short mood description","genres":["genre"],"searchTerms":["short useful music search query"],"energy":"low|medium|high","narration":"optional short Chinese DJ intro"}
Use 2-4 searchTerms that can be used to search a real music catalog. Keep title and mood concise, do not invent track titles, IDs, URLs or claim any track is available. Narration should be one short sentence, suitable between songs. No markdown.`;

const jsonHeaders = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };

function fallback(message: string) {
  const rain = /雨|雨夜|rain|storm/i.test(message);
  const low = /难过|失落|伤心|失恋|孤独|sad|lonely/i.test(message);
  const focus = /专注|工作|学习|focus|work/i.test(message);
  const genres = /民谣|folk/i.test(message) ? ["民谣", "独立民谣"] : ["独立音乐", "民谣", "氛围音乐"];
  return { title: rain ? "雨夜慢行电台" : low ? "温柔陪伴电台" : focus ? "安静专注电台" : "深夜陪伴电台", mood: rain ? "潮湿、安静、带一点回忆" : low ? "柔和、克制、慢慢舒展" : focus ? "稳定、轻盈、不打扰" : "安静、温暖、适合独处", genres, searchTerms: [...new Set([message.slice(0, 48), ...genres])].slice(0, 4), energy: "low", narration: "把这一刻留给音乐，慢一点也没关系。" };
}

export function parseBrief(value: unknown, message: string) {
  const root = value as { title?: unknown; mood?: unknown; genres?: unknown; searchTerms?: unknown; energy?: unknown; narration?: unknown } | null;
  if (!root || typeof root !== "object") return fallback(message);
  const cleanText = (item: unknown, maxLength: number): string | null => {
    if (typeof item !== "string") return null;
    const cleaned = item.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, maxLength);
    return cleaned || null;
  };
  const genres = Array.isArray(root.genres)
    ? root.genres.map(item => cleanText(item, 40)).filter((item): item is string => item !== null).slice(0, 5)
    : [];
  const searchTerms = Array.isArray(root.searchTerms)
    ? [...new Set(root.searchTerms.map(item => cleanText(item, 80)).filter((item): item is string => item !== null))].slice(0, 4)
    : [];
  return {
    title: cleanText(root.title, 60) ?? fallback(message).title,
    mood: cleanText(root.mood, 100) ?? fallback(message).mood,
    genres: genres.length ? genres : fallback(message).genres,
    searchTerms: searchTerms.length ? searchTerms : fallback(message).searchTerms,
    energy: root.energy === "high" || root.energy === "medium" ? root.energy : "low",
    narration: cleanText(root.narration, 240) ?? fallback(message).narration,
  };
}

export default async function handler(req: Request) {
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method Not Allowed" }), { status: 405, headers: jsonHeaders });
  try {
    const body = await req.json() as { message?: unknown };
    const message = typeof body.message === "string" ? body.message.trim().slice(0, 500) : "";
    if (!message) return new Response(JSON.stringify({ error: "Missing message" }), { status: 400, headers: jsonHeaders });

    const provider = (process.env.AI_PROVIDER || process.env.VITE_AI_PROVIDER || process.env.FOLIA_AI_PROVIDER || "gemini").toLowerCase();
    let raw: unknown = null;
    const normalizedProvider = provider === "google" ? "gemini" : provider;
    if (normalizedProvider === "openai") {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) return new Response(JSON.stringify({ error: "OpenAI API key is not configured on the server" }), { status: 503, headers: jsonHeaders });
      const base = (process.env.OPENAI_API_URL || "https://api.openai.com/v1/chat/completions").replace(/\/+$/, "");
      const url = base.endsWith("/chat/completions") ? base : base.endsWith("/v1") ? base + "/chat/completions" : base + "/v1/chat/completions";
      const response = await fetch(url, { method: "POST", headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" }, body: JSON.stringify({ model: process.env.OPENAI_API_MODEL || "gpt-4o-mini", temperature: 0.6, response_format: { type: "json_object" }, messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: message }] }) });
      if (!response.ok) throw new Error("AI provider request failed (" + response.status + ")");
      const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      raw = JSON.parse(data.choices?.[0]?.message?.content || "{}");
    } else if (normalizedProvider === "gemini") {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) return new Response(JSON.stringify({ error: "Gemini API key is not configured on the server" }), { status: 503, headers: jsonHeaders });
      const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
      const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(apiKey), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] }, contents: [{ role: "user", parts: [{ text: message }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.6 } }) });
      if (!response.ok) throw new Error("AI provider request failed (" + response.status + ")");
      const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
      raw = JSON.parse(data.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("") || "{}");
    } else {
      return new Response(JSON.stringify({ error: "Unsupported AI provider configured on the server", code: "AI_PROVIDER_UNSUPPORTED" }), { status: 503, headers: jsonHeaders });
    }
    return new Response(JSON.stringify(parseBrief(raw, message)), { status: 200, headers: jsonHeaders });
  } catch (error) {
    console.error("[RadioAgent] request failed:", error);
    return new Response(JSON.stringify({ error: "Radio Agent could not reach the configured AI service" }), { status: 502, headers: jsonHeaders });
  }
}
