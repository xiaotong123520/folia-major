/**
 * Read-only response probe for the three user-supplied, UNVERIFIED point-song endpoints.
 * Usage: node deploy/music-backend-gateway/probe-point-song-endpoints.mjs "song title"
 *
 * Does not follow redirects, download audio, decode subscriber content, or expose stream URLs.
 * This is a diagnostics tool, not a player or authorization bypass.
 */
const title = (process.argv[2] || '').trim();
if (!title || title.length > 80) {
  console.error('Usage: node probe-point-song-endpoints.mjs "歌曲名称" (1–80 characters)');
  process.exit(2);
}
const targets = [
  ['api.lxink.cn QQ', 'https://api.lxink.cn/api-qqmusic/?action=play&type=vip&songName='],
  ['luckying 网易云', 'https://cer.luckying.love/music/LuckyWYY.php?Love='],
  ['luckying QQ', 'https://cer.luckying.love/music/Lucky.php?Love='],
];
for (const [name, base] of targets) {
  const url = base + encodeURIComponent(title);
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
      headers: { Accept: 'application/json, text/plain;q=0.8, */*;q=0.1' },
    });
    const type = response.headers.get('content-type') || '';
    const length = response.headers.get('content-length') || '';
    // A 2xx status alone never proves the endpoint returned authorized playable audio.
    let format = 'unknown';
    let fields = [];
    if (type.includes('audio/')) {
      format = 'audio (not downloaded)';
    } else if (response.status >= 300 && response.status < 400) {
      format = 'redirect (target hidden)';
    } else if (type.includes('json') || type.includes('text')) {
      if (Number(length) > 16_384) {
        format = 'oversized text';
      } else {
        const reader = response.body?.getReader();
        const chunks = [];
        let size = 0;
        while (reader) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 16_384) { format = 'oversized text'; await reader.cancel(); break; }
          chunks.push(value);
        }
        if (format !== 'oversized text') {
          const bytes = new Uint8Array(size);
          let at = 0;
          for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
          const body = new TextDecoder().decode(bytes);
          try {
            const result = JSON.parse(body);
            format = 'JSON';
            fields = result && typeof result === 'object' && !Array.isArray(result)
              ? Object.keys(result).slice(0, 16) : [];
          } catch { format = body.trim().startsWith('<') ? 'HTML' : 'text'; }
        }
      }
    }
    response.body?.cancel?.().catch?.(() => {});
    console.log(JSON.stringify({ name, http: response.status, type, format, fields }));
  } catch (error) {
    console.log(JSON.stringify({ name, status: 'unreachable', reason: error?.name || 'network error' }));
  }
}
