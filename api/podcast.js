import qr from "qrcode";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";

//#region api-ts/xiaoyuzhou/content.ts
const ID = /^[a-f0-9]{24}$/i;
const WEB = "https://www.xiaoyuzhoufm.com";
const PUBLIC_IDS = [
	"6021f949a789fca4eff4492c",
	"64228877179eec53318a7182",
	"61de7563ca67da205ff02279"
];
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1";
function parseLink(input) {
	if (ID.test(input)) return {
		kind: "podcast",
		id: input
	};
	try {
		const url = new URL(input);
		if (url.protocol !== "https:" || !["www.xiaoyuzhoufm.com", "xiaoyuzhoufm.com"].includes(url.hostname) || url.username || url.password || url.port) return null;
		const match = /^\/(podcast|episode)\/([a-f0-9]{24})\/?$/i.exec(url.pathname);
		return match ? {
			kind: match[1],
			id: match[2]
		} : null;
	} catch {
		return null;
	}
}
function image(raw) {
	const value = raw?.largePicUrl || raw?.picUrl || raw?.middlePicUrl || raw?.smallPicUrl || "";
	return typeof value === "string" && value.startsWith("https://") ? value : "";
}
function podcast(raw) {
	if (!ID.test(raw?.pid || "")) throw new Error("Invalid podcast response");
	return {
		id: raw.pid,
		title: String(raw.title || ""),
		author: String(raw.author || ""),
		cover: image(raw.image),
		description: String(raw.description || raw.brief || ""),
		count: Number(raw.episodeCount) || 0
	};
}
function episode(raw, parent) {
	if (!ID.test(raw?.eid || "")) throw new Error("Invalid episode response");
	const pod = raw.podcast || parent;
	return {
		id: raw.eid,
		title: String(raw.title || ""),
		duration: Math.max(0, Number(raw.duration) || 0),
		podcastId: pod?.pid || raw.pid || "",
		podcastTitle: String(pod?.title || ""),
		author: String(pod?.author || ""),
		cover: image(raw.image) || image(pod?.image),
		publishedAt: raw.pubDate || "",
		audio: raw.media?.source?.url || raw.enclosure?.url || "",
		private: raw.isPrivateMedia === true
	};
}
function pageItems(body) {
	if (Array.isArray(body?.data)) return {
		items: body.data,
		cursor: body.loadMoreKey ?? null
	};
	if (Array.isArray(body?.data?.data)) return {
		items: body.data.data,
		cursor: body.data.loadMoreKey ?? null
	};
	throw new Error("Invalid podcast list response");
}
function extractPage(html) {
	const script = html.match(/<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
	if (!script) throw new Error("Podcast page data is missing");
	const data = JSON.parse(script[1]);
	if (data.page === "/404" || !data.props?.pageProps) throw new Error("Podcast was not found");
	return data.props.pageProps;
}
async function publicPage(kind, id) {
	if (!["podcast", "episode"].includes(kind) || !ID.test(id)) throw new Error("Invalid podcast link");
	const response = await fetch(`${WEB}/${kind}/${id}`, {
		redirect: "error",
		headers: {
			"User-Agent": UA,
			Accept: "text/html"
		},
		signal: AbortSignal.timeout(15e3)
	});
	if (!response.ok) throw new Error(`Public podcast request failed (HTTP ${response.status})`);
	const html = await response.text();
	if (html.length > 4e6) throw new Error("Podcast response is too large");
	return extractPage(html);
}
function allowedAudio(value) {
	try {
		const url = new URL(value);
		return url.protocol === "https:" && (url.hostname === "xyzcdn.net" || url.hostname.endsWith(".xyzcdn.net")) && !url.port && !url.username && !url.password ? url : null;
	} catch {
		return null;
	}
}

//#endregion
//#region api-ts/xiaoyuzhou/session.ts
const SESSION = "__Secure-tingyu-podcast";
const PENDING = "__Secure-tingyu-podcast-qr";
function secret() {
	const value = process.env.PODCAST_SESSION_SECRET || process.env.QQ_SESSION_SECRET;
	if (!value || value.length < 32) throw new Error("Podcast login is not configured");
	return createHash("sha256").update("tingyu-podcast-v1\0" + value).digest();
}
function seal(value, ttl) {
	const nonce = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", secret(), nonce);
	const encrypted = Buffer.concat([cipher.update(JSON.stringify({
		value,
		expires: Date.now() + ttl * 1e3
	})), cipher.final()]);
	return Buffer.concat([
		nonce,
		cipher.getAuthTag(),
		encrypted
	]).toString("base64url");
}
function unseal(value) {
	try {
		const packed = Buffer.from(value, "base64url");
		const decipher = createDecipheriv("aes-256-gcm", secret(), packed.subarray(0, 12));
		decipher.setAuthTag(packed.subarray(12, 28));
		const data = JSON.parse(Buffer.concat([decipher.update(packed.subarray(28)), decipher.final()]).toString());
		return data.expires > Date.now() ? data.value : null;
	} catch {
		return null;
	}
}
function readCookie(req, pending = false) {
	const name = pending ? PENDING : SESSION;
	const value = String(req.headers.cookie || "").split(";").map((row) => row.trim()).find((row) => row.startsWith(name + "="));
	return value ? unseal(value.slice(name.length + 1)) : null;
}
function setCookie(res, value, pending = false) {
	const ttl = value ? pending ? 300 : 1209600 : 0;
	const cookie = `${pending ? PENDING : SESSION}=${value ? seal(value, ttl) : ""}; Path=/api/podcast; Max-Age=${ttl}; HttpOnly; Secure; SameSite=Strict`;
	const previous = res.getHeader("Set-Cookie");
	res.setHeader("Set-Cookie", [...Array.isArray(previous) ? previous : previous ? [previous] : [], cookie]);
}

//#endregion
//#region api-ts/xiaoyuzhou/account.ts
const API = "https://api.xiaoyuzhoufm.com";
const WEB_API = "https://web-api.xiaoyuzhoufm.com";
var PodcastError = class extends Error {
	status;
	constructor(status, message) {
		super(message);
		this.status = status;
	}
};
const webHeaders = () => ({
	"Content-Type": "application/json;charset=UTF-8",
	"User-Agent": UA,
	Origin: "https://accounts.xiaoyuzhoufm.com",
	Referer: "https://accounts.xiaoyuzhoufm.com/",
	"x-midway-app-id": "v6worU4NnWyL"
});
async function qrCreate() {
	const response = await fetch(WEB_API + "/v1/auth/qrcode/create", {
		method: "POST",
		headers: webHeaders(),
		body: JSON.stringify({ clientId: "xyz-web" }),
		signal: AbortSignal.timeout(15e3)
	});
	if (!response.ok) throw new PodcastError(502, `创建二维码失败（HTTP ${response.status}）`);
	const data = await response.json();
	if (typeof data.id !== "string" || !data.id || data.id.length > 256) throw new PodcastError(502, "二维码响应异常");
	return {
		id: data.id,
		url: `https://h5.xiaoyuzhoufm.com/oauth?qrcode_id=${encodeURIComponent(data.id)}`
	};
}
async function qrCheck(req, res, id) {
	const pending = readCookie(req, true);
	if (!pending || pending.id !== id) throw new PodcastError(400, "二维码已过期，请刷新");
	const response = await fetch(WEB_API + "/v1/auth/qrcode/login", {
		method: "POST",
		headers: webHeaders(),
		body: JSON.stringify({ id }),
		signal: AbortSignal.timeout(15e3)
	});
	if (response.status === 400 || response.status === 401) {
		setCookie(res, null, true);
		return { state: "expired" };
	}
	if (!response.ok) throw new PodcastError(502, `查询登录失败（HTTP ${response.status}）`);
	const data = await response.json();
	if (["USED", "CONFIRMED"].includes(data.status)) {
		const access = response.headers.get("x-jike-access-token");
		const refresh = response.headers.get("x-jike-refresh-token");
		if (!access || !refresh) throw new PodcastError(502, "登录响应缺少授权信息，请重新扫码");
		setCookie(res, {
			access,
			refresh,
			device: pending.device
		});
		setCookie(res, null, true);
		return { state: "confirmed" };
	}
	if (data.status === "SCANNED") return { state: "scanned" };
	if (data.status === "EXPIRED") {
		setCookie(res, null, true);
		return { state: "expired" };
	}
	if (["WAITTING", "WAITING"].includes(data.status)) return { state: "waiting" };
	throw new PodcastError(502, "无法识别扫码状态，请刷新二维码");
}
const newDevice = () => randomUUID().toUpperCase();
async function accountFetch(req, res, path, body, web = false) {
	let session = readCookie(req);
	if (!session?.access) throw new PodcastError(401, "请先登录小宇宙；公开节目仍可免登录收听");
	const run = () => fetch((web ? WEB_API : API) + path, {
		method: body === void 0 ? "GET" : "POST",
		headers: {
			"Content-Type": "application/json",
			"User-Agent": "Xiaoyuzhou/2.57.1 (build:1576; iOS 17.4.1)",
			OS: "ios",
			Manufacturer: "Apple",
			Model: "iPhone14,2",
			BundleID: "app.podcast.cosmos",
			"App-Version": "2.57.1",
			"App-BuildNo": "1576",
			Market: "AppStore",
			"x-jike-device-id": session.device,
			"x-jike-access-token": session.access,
			...web ? {
				Origin: "https://www.xiaoyuzhoufm.com",
				Referer: "https://www.xiaoyuzhoufm.com/"
			} : {}
		},
		body: body === void 0 ? void 0 : JSON.stringify(body),
		signal: AbortSignal.timeout(15e3)
	});
	let response = await run();
	if (response.status === 401 && session.refresh) {
		const refreshed = await fetch(API + "/app_auth_tokens.refresh", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-jike-refresh-token": session.refresh
			},
			signal: AbortSignal.timeout(15e3)
		});
		const data = refreshed.ok ? await refreshed.json() : null;
		const value = data?.data || data;
		const access = refreshed.headers.get("x-jike-access-token") || value?.["x-jike-access-token"];
		const refresh = refreshed.headers.get("x-jike-refresh-token") || value?.["x-jike-refresh-token"];
		if (access && refresh) {
			session = {
				...session,
				access,
				refresh
			};
			setCookie(res, session);
			response = await run();
		}
	}
	if (response.status === 401) {
		setCookie(res, null);
		throw new PodcastError(401, "登录已过期，公开节目仍可收听");
	}
	if (!response.ok) throw new PodcastError(502, `小宇宙服务暂不可用（HTTP ${response.status}）`);
	return response.json();
}

//#endregion
//#region api-ts/podcast.ts
const publicCache = /* @__PURE__ */ new Map();
async function readPublic(kind, id) {
	const key = kind + ":" + id;
	const kept = publicCache.get(key);
	if (kept && kept.expires > Date.now()) return kept.value;
	const value = await publicPage(kind, id);
	if (publicCache.size >= 100) publicCache.delete(publicCache.keys().next().value);
	publicCache.set(key, {
		value,
		expires: Date.now() + 3e5
	});
	return value;
}
const cleanEpisode = (value) => {
	const { audio, private: _private, ...safe } = value;
	return safe;
};
const validId = (id) => {
	if (typeof id !== "string" || !ID.test(id)) throw new PodcastError(400, "无效的播客链接");
	return id;
};
async function featured() {
	const items = (await Promise.allSettled(PUBLIC_IDS.map(async (id) => podcast((await readPublic("podcast", id)).podcast)))).flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
	if (!items.length) throw new PodcastError(502, "暂时无法读取公开播客，请稍后重试");
	return {
		items,
		cursor: null
	};
}
async function audio(req, res, id) {
	let value = episode((await readPublic("episode", validId(id))).episode);
	if ((!value.audio || value.private) && readCookie(req)?.access) {
		const data = await accountFetch(req, res, "/v1/private-media/get?eid=" + id + "&dubbing=false");
		value = {
			...value,
			audio: data?.data?.url || ""
		};
	}
	const target = allowedAudio(value.audio);
	if (!target) throw new PodcastError(403, "该单集暂无可播放的音频，可能需要登录或在小宇宙内购买");
	const range = req.headers.range;
	if (range && !/^bytes=(?:\d+-\d*|-\d+)$/.test(range)) throw new PodcastError(416, "无效的音频范围");
	const upstream = await fetch(target, {
		method: req.method,
		redirect: "error",
		headers: range ? { Range: range } : {},
		signal: AbortSignal.timeout(6e4)
	});
	if (upstream.status === 416) {
		res.status(416).end();
		return;
	}
	if (![200, 206].includes(upstream.status)) throw new PodcastError(502, "音频服务暂不可用");
	const type = upstream.headers.get("content-type") || "";
	if (!/^(audio\/|application\/octet-stream)/i.test(type)) throw new PodcastError(502, "服务未返回有效音频");
	for (const header of [
		"content-type",
		"content-length",
		"content-range",
		"accept-ranges"
	]) {
		const value = upstream.headers.get(header);
		if (value) res.setHeader(header, value);
	}
	res.status(upstream.status);
	if (req.method === "HEAD" || !upstream.body) {
		res.end();
		return;
	}
	await pipeline(Readable.fromWeb(upstream.body), res);
}
async function handler(req, res) {
	res.setHeader("Cache-Control", "private, no-store");
	res.setHeader("X-Content-Type-Options", "nosniff");
	res.setHeader("Referrer-Policy", "no-referrer");
	try {
		const url = new URL(req.url || "/", "https://localhost");
		if (url.searchParams.get("action") === "audio" && ["GET", "HEAD"].includes(req.method)) return await audio(req, res, url.searchParams.get("id") || "");
		if (req.method !== "POST") {
			res.setHeader("Allow", "POST");
			return res.status(405).json({ error: "Method not allowed" });
		}
		if (req.headers["x-podcast-request"] !== "1" || !String(req.headers["content-type"]).startsWith("application/json")) throw new PodcastError(403, "请求来源无效");
		const origin = req.headers.origin;
		const host = req.headers["x-forwarded-host"] || req.headers.host;
		if (origin && new URL(origin).host !== host) throw new PodcastError(403, "请求来源无效");
		const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
		if (JSON.stringify(body).length > 8192) throw new PodcastError(400, "请求过长");
		const { action, id, query, cursor } = body;
		let result;
		switch (action) {
			case "featured":
				result = await featured();
				break;
			case "status": {
				if (!readCookie(req)?.access) {
					result = null;
					break;
				}
				const data = await accountFetch(req, res, "/web/user/get-me", void 0, true);
				if (!data?.data?.uid) throw new PodcastError(502, "无法读取账户信息");
				result = {
					id: data.data.uid,
					nickname: data.data.nickname || "",
					avatarUrl: data.data.avatarUrl || ""
				};
				break;
			}
			case "qrStart": {
				const value = await qrCreate();
				setCookie(res, {
					id: value.id,
					device: newDevice()
				}, true);
				result = {
					key: value.id,
					imageUrl: await qr.toDataURL(value.url, {
						width: 320,
						margin: 2
					})
				};
				break;
			}
			case "qrCheck":
				result = await qrCheck(req, res, String(id || ""));
				break;
			case "qrCancel":
				if (readCookie(req, true)?.id === id) setCookie(res, null, true);
				result = {};
				break;
			case "logout":
				setCookie(res, null);
				setCookie(res, null, true);
				result = {};
				break;
			case "subscriptions": {
				const data = await accountFetch(req, res, "/v1/subscription/list", {
					sortBy: "subscribedAt",
					...cursor ? { loadMoreKey: cursor } : {}
				});
				const page = pageItems(data);
				result = {
					items: page.items.map(podcast),
					cursor: page.cursor
				};
				break;
			}
			case "podcast":
				result = podcast((await readPublic("podcast", validId(id))).podcast);
				break;
			case "episode":
				result = cleanEpisode(episode((await readPublic("episode", validId(id))).episode));
				break;
			case "episodes": {
				validId(id);
				if (readCookie(req)?.access) try {
					const data = await accountFetch(req, res, "/v1/episode/list", {
						pid: id,
						order: "desc",
						...cursor ? { loadMoreKey: cursor } : {}
					});
					const page = pageItems(data);
					const parent = (await readPublic("podcast", id)).podcast;
					result = {
						items: page.items.map((raw) => cleanEpisode(episode(raw, parent))),
						cursor: page.cursor
					};
					break;
				} catch (error) {
					if (!(error instanceof PodcastError) || error.status !== 401 || cursor) throw error;
				}
				const raw = (await readPublic("podcast", id)).podcast;
				result = {
					items: (raw.episodes || []).map((item) => cleanEpisode(episode(item, raw))),
					cursor: null
				};
				break;
			}
			case "search": {
				if (typeof query !== "string" || query.length > 512 || !query.trim()) throw new PodcastError(400, "请输入节目名称或完整小宇宙分享链接");
				const link = parseLink(query.trim());
				if (link) {
					const raw = await readPublic(link.kind, link.id);
					result = {
						items: link.kind === "episode" ? [cleanEpisode(episode(raw.episode))] : (raw.podcast.episodes || []).map((item) => cleanEpisode(episode(item, raw.podcast))),
						cursor: null
					};
					break;
				}
				if (!readCookie(req)?.access) throw new PodcastError(401, "免登录请粘贴完整小宇宙节目或单集链接；全站关键词搜索需要登录");
				const data = await accountFetch(req, res, "/v1/search/create", {
					keyword: query.trim(),
					type: "EPISODE",
					...cursor ? { loadMoreKey: cursor } : {}
				});
				const page = pageItems(data);
				result = {
					items: page.items.filter((item) => item.type === "EPISODE").map((raw) => cleanEpisode(episode(raw))),
					cursor: page.cursor
				};
				break;
			}
			default: throw new PodcastError(400, "不支持的播客操作");
		}
		return res.status(200).json({ data: result });
	} catch (error) {
		if (res.headersSent) {
			res.destroy();
			return;
		}
		const status = error instanceof PodcastError ? error.status : 502;
		return res.status(status).json({ error: error instanceof PodcastError ? error.message : "播客服务暂时无法连接，请稍后重试" });
	}
}

//#endregion
export { handler as default };