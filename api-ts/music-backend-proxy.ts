import type { IncomingMessage } from "node:http";

const responseHeaders = {
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

const allowedPaths = new Map<string, Set<string>>([
  ["/api/v1/music/search", new Set(["q", "keyword", "type", "sources", "limit", "offset"])],
  ["/api/v1/music/url", new Set(["id", "source", "name", "artist", "album", "cover", "duration", "extra"])],
  ["/api/v1/music/stream", new Set(["id", "source", "name", "artist", "album", "cover", "duration", "extra"])],
  ["/api/v1/music/inspect", new Set(["id", "source", "name", "artist", "album", "cover", "duration", "extra"])],
  ["/api/v1/music/switch", new Set(["id", "source", "name", "artist", "album", "cover", "duration", "extra"])],
  ["/api/v1/music/lyric", new Set(["id", "source", "name", "artist", "album", "cover", "duration", "extra"])],
  ["/api/v1/playlist/detail", new Set(["id", "source"])],
  ["/api/v1/album/detail", new Set(["id", "source"])],
]);

const requestCounts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 90;

function getClientKey(req: Request): string {
  return req.headers.get("x-real-ip")
    || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
}

function isRateLimited(key: string): boolean {
  const now = Date.now();
  for (const [entryKey, value] of requestCounts) {
    if (value.resetAt <= now) requestCounts.delete(entryKey);
  }
  const current = requestCounts.get(key);
  if (!current || current.resetAt <= now) {
    requestCounts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > MAX_REQUESTS_PER_WINDOW;
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...responseHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function getUpstreamBase(): URL | null {
  const value = process.env.MUSIC_BACKEND_UPSTREAM_URL?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return null;
    if (url.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return null;
    url.search = "";
    url.hash = "";
    url.pathname = url.pathname.replace(/\/+$/, "");
    return url;
  } catch {
    return null;
  }
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return json(405, { error: "Method Not Allowed" });
  }

  const allowedOrigins = (process.env.FOLIA_ALLOWED_ORIGINS || "")
    .split(",").map((origin) => origin.trim()).filter(Boolean);
  const requestOrigin = req.headers.get("origin");
  if (allowedOrigins.length && requestOrigin && !allowedOrigins.includes(requestOrigin)) {
    return json(403, { error: "Origin not allowed" });
  }

  if (isRateLimited(getClientKey(req))) {
    return json(429, { error: "Rate limit exceeded" });
  }

  const upstream = getUpstreamBase();
  if (!upstream) {
    return json(503, {
      error: "Music backend is not configured",
      code: "MUSIC_BACKEND_NOT_CONFIGURED",
    });
  }

  const requestUrl = new URL(req.url);
  const path = requestUrl.searchParams.get("path") || "";
  const allowedParams = allowedPaths.get(path);
  if (!allowedParams) return json(404, { error: "Endpoint not allowed" });

  const upstreamUrl = new URL(upstream.toString());
  upstreamUrl.pathname = `${upstream.pathname}${path}`.replace(/\/{2,}/g, "/");
  for (const [key, value] of requestUrl.searchParams.entries()) {
    if (key === "path") continue;
    if (!allowedParams.has(key)) return json(400, { error: `Query parameter not allowed: ${key}` });
    if (value.length > 2048) return json(400, { error: "Query parameter too long" });
    upstreamUrl.searchParams.append(key, value);
  }

  const headers = new Headers({ Accept: req.headers.get("accept") || "application/json" });
  const range = req.headers.get("range");
  if (range && path === "/api/v1/music/stream") headers.set("Range", range);

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      method: req.method,
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(25_000),
    });

    const outHeaders = new Headers(responseHeaders);
    for (const name of ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified"]) {
      const value = upstreamResponse.headers.get(name);
      if (value) outHeaders.set(name, value);
    }
    if (path === "/api/v1/music/stream") outHeaders.set("Cache-Control", "private, no-store");
    else outHeaders.set("Cache-Control", "no-store, max-age=0");

    return new Response(req.method === "HEAD" ? null : upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: outHeaders,
    });
  } catch {
    return json(502, { error: "Music backend upstream request failed" });
  }
}
