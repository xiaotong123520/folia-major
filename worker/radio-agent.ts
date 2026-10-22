// worker/radio-agent.ts
// Cloudflare adapter for mood-to-radio planning; secrets stay in Worker environment bindings.
type RadioEnv = {
    AI_PROVIDER?: string;
    GEMINI_API_KEY?: string;
    GEMINI_MODEL?: string;
    OPENAI_API_KEY?: string;
    OPENAI_API_URL?: string;
    OPENAI_API_MODEL?: string;
};

const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const systemPrompt = 'You are Folia music radio curator. Return only JSON: {"title":"short Chinese title","mood":"short mood","genres":["genre"],"searchTerms":["catalog query"],"energy":"low|medium|high","narration":"one short Chinese sentence"}. Use 2-4 real catalog search terms. Never invent track titles, IDs, URLs or availability. No markdown.';
const fallback = (message: string) => {
    const rain = /雨|雨夜|rain|storm/i.test(message);
    const low = /难过|失落|伤心|失恋|孤独|sad|lonely/i.test(message);
    const genres = /民谣|folk/i.test(message) ? ['民谣', '独立民谣'] : ['独立音乐', '民谣', '氛围音乐'];
    return { title: rain ? '雨夜慢行电台' : low ? '温柔陪伴电台' : '深夜陪伴电台', mood: rain ? '潮湿、安静、带一点回忆' : low ? '柔和、克制、慢慢舒展' : '安静、温暖、适合独处', genres, searchTerms: [...new Set([message.slice(0, 48), ...genres])].slice(0, 4), energy: 'low', narration: '把这一刻留给音乐，慢一点也没关系。' };
};
const clean = (value: unknown, limit: number): string | null => {
    if (typeof value !== 'string') return null;
    const result = value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, limit);
    return result || null;
};
const parseBrief = (raw: unknown, message: string) => {
    const base = fallback(message);
    if (!raw || typeof raw !== 'object') return base;
    const value = raw as Record<string, unknown>;
    const genres = Array.isArray(value.genres) ? value.genres.map(item => clean(item, 40)).filter((item): item is string => item !== null).slice(0, 5) : [];
    const searchTerms = Array.isArray(value.searchTerms) ? [...new Set(value.searchTerms.map(item => clean(item, 80)).filter((item): item is string => item !== null))].slice(0, 4) : [];
    return {
        title: clean(value.title, 60) ?? base.title,
        mood: clean(value.mood, 100) ?? base.mood,
        genres: genres.length ? genres : base.genres,
        searchTerms: searchTerms.length ? searchTerms : base.searchTerms,
        energy: value.energy === 'high' || value.energy === 'medium' ? value.energy : 'low',
        narration: clean(value.narration, 240) ?? base.narration,
    };
};

export async function handleRadioAgent(request: Request, env: RadioEnv): Promise<Response> {
    if (request.method !== 'POST') return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers });
    try {
        const body = await request.json() as { message?: unknown };
        const message = typeof body.message === 'string' ? body.message.trim().slice(0, 500) : '';
        if (!message) return new Response(JSON.stringify({ error: 'Missing message' }), { status: 400, headers });
        const provider = (env.AI_PROVIDER || 'gemini').toLowerCase();
        let raw: unknown;
        if (provider === 'openai') {
            if (!env.OPENAI_API_KEY) return new Response(JSON.stringify({ error: 'OpenAI API key is not configured on the server' }), { status: 503, headers });
            const base = (env.OPENAI_API_URL || 'https://api.openai.com/v1/chat/completions').replace(/\/+$/, '');
            const endpoint = base.endsWith('/chat/completions') ? base : base.endsWith('/v1') ? base + '/chat/completions' : base + '/v1/chat/completions';
            const response = await fetch(endpoint, { method: 'POST', headers: { authorization: 'Bearer ' + env.OPENAI_API_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ model: env.OPENAI_API_MODEL || 'gpt-4o-mini', temperature: 0.6, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: message }] }) });
            if (!response.ok) throw new Error('OpenAI request failed: ' + response.status);
            const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
            raw = JSON.parse(data.choices?.[0]?.message?.content || '{}');
        } else if (provider === 'gemini' || provider === 'google') {
            if (!env.GEMINI_API_KEY) return new Response(JSON.stringify({ error: 'Gemini API key is not configured on the server' }), { status: 503, headers });
            const model = env.GEMINI_MODEL || 'gemini-2.5-flash';
            const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(env.GEMINI_API_KEY), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ systemInstruction: { parts: [{ text: systemPrompt }] }, contents: [{ role: 'user', parts: [{ text: message }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.6 } }) });
            if (!response.ok) throw new Error('Gemini request failed: ' + response.status);
            const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
            raw = JSON.parse(data.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || '{}');
        } else {
            return new Response(JSON.stringify({ error: 'Unsupported AI provider configured on the server' }), { status: 503, headers });
        }
        return new Response(JSON.stringify(parseBrief(raw, message)), { status: 200, headers });
    } catch (error) {
        console.error('[RadioAgent] Cloudflare request failed:', error);
        return new Response(JSON.stringify({ error: 'Radio Agent could not reach the configured AI service' }), { status: 502, headers });
    }
}
