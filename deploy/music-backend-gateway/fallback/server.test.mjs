import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { createFallbackHandler } from './server.mjs';

async function withApi(env, upstream, callback) {
  const calls = [];
  const backend = createFallbackHandler({
    MUSIC_PRIMARY_BACKEND_URL: 'http://go-music-api:8080',
    MUSIC_ENABLE_NAME_LOOKUP: 'true',
    MUSIC_AUDIO_ALLOW_HOSTS: 'audio.trusted.example',
    ...env,
  }, async (input, init) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    return upstream(url, init);
  });
  const server = http.createServer((req, res) =>
    Promise.resolve(backend(req, res)).catch(error => {
      if (!res.headersSent) { res.writeHead(502); res.end(String(error)); } else res.destroy();
    }));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  try { return await callback(base, calls); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
const okSearch = () => new Response(JSON.stringify({ code: 200, data: { songs: [{
  id: '123', source: 'qq', name: 'Another track', artist: 'Tester',
}] } }), { headers: { 'content-type': 'application/json' } });
const getSong = async (base, source) => {
  const response = await fetch(base + '/api/v1/music/search?q=' + encodeURIComponent('夜空'), { signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, 200);
  const data = await response.json();
  return data.data.songs.find(s => s.source === source && String(s.id).startsWith('legacy-'));
};

test('enables all three point-song endpoints: QQ lxink, QQ Lucky, NetEase LuckyWYY', async () => {
  await withApi({}, async url => {
    if (url.hostname === 'go-music-api') return okSearch();
    if (url.hostname === 'api.lxink.cn') {
      assert.equal(url.searchParams.get('songName'), '夜空');
      assert.equal(url.searchParams.get('action'), 'play');
      assert.equal(url.searchParams.get('type'), 'vip');
      return new Response(JSON.stringify({ data: { url: 'https://audio.trusted.example/test.mp3' } }), {
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.hostname === 'audio.trusted.example') return new Response('ABC', {
      status: 206, headers: { 'content-type': 'audio/mpeg', 'content-range': 'bytes 0-2/36', 'accept-ranges': 'bytes' },
    });
    if (url.hostname === 'cer.luckying.love' && url.pathname.endsWith('/LuckyWYY.php')) {
      assert.equal(url.searchParams.get('Love'), '夜空');
      return new Response('WYY', { headers: { 'content-type': 'audio/mpeg' } });
    }
    return new Response('offline', { status: 503 });
  }, async (base, calls) => {
    const qq = await getSong(base, 'qq');
    const netease = await getSong(base, 'netease');
    assert.ok(qq, 'QQ name-only choice is available alongside normal search results');
    assert.ok(netease, 'NetEase name-only choice is available');
    const q = await fetch(base + '/api/v1/music/stream?source=qq&id=' + encodeURIComponent(qq.id), {
      headers: { range: 'bytes=0-2' }, signal: AbortSignal.timeout(5000),
    });
    assert.equal(q.status, 206);
    assert.equal(q.headers.get('content-range'), 'bytes 0-2/36');
    assert.equal(await q.text(), 'ABC');
    const n = await fetch(base + '/api/v1/music/stream?source=netease&id=' + encodeURIComponent(netease.id), {
      signal: AbortSignal.timeout(5000),
    });
    assert.equal(n.status, 200);
    assert.equal(await n.text(), 'WYY');
    assert.ok(calls.some(c => c.url.hostname === 'api.lxink.cn'));
    assert.ok(calls.some(c => c.url.pathname.endsWith('LuckyWYY.php')));
    assert.ok(!calls.some(c => c.url.pathname.endsWith('Lucky.php'))); // QQ first option worked
  });
});

test('tries second QQ endpoint if lxink fails', async () => {
  await withApi({}, async url => {
    if (url.hostname === 'go-music-api') return okSearch();
    if (url.hostname === 'api.lxink.cn') return new Response('unavailable', { status: 502 });
    if (url.pathname.endsWith('/Lucky.php')) {
      assert.equal(url.searchParams.get('Love'), '夜空');
      return new Response('QQ_BACKUP', { headers: { 'content-type': 'audio/mpeg' } });
    }
    return new Response('not found', { status: 404 });
  }, async (base, calls) => {
    const qq = await getSong(base, 'qq');
    const response = await fetch(base + '/api/v1/music/stream?source=qq&id=' + encodeURIComponent(qq.id), { signal: AbortSignal.timeout(5000) });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'QQ_BACKUP');
    assert.ok(calls.some(c => c.url.pathname.endsWith('Lucky.php')));
  });
});

test('rejects media links outside host allowlist and private loopback URLs', async () => {
  await withApi({}, async url => {
    if (url.hostname === 'go-music-api') return okSearch();
    if (url.hostname === 'api.lxink.cn') return new Response(JSON.stringify({ url: 'http://127.0.0.1:8999/admin' }), { headers: { 'content-type': 'application/json' } });
    if (url.pathname.endsWith('/Lucky.php')) return new Response(JSON.stringify({ url: 'https://not-allowed.example/audio.mp3' }), { headers: { 'content-type': 'application/json' } });
    throw Error('Should not fetch unapproved media URLs');
  }, async (base, calls) => {
    const qq = await getSong(base, 'qq');
    const response = await fetch(base + '/api/v1/music/stream?source=qq&id=' + encodeURIComponent(qq.id), { signal: AbortSignal.timeout(5000) });
    assert.equal(response.status, 404);
    assert.ok(!calls.some(c => c.url.hostname === '127.0.0.1' || c.url.hostname === 'not-allowed.example'));
  });
});

test('allows administrator to disable all three endpoints', async () => {
  await withApi({ MUSIC_ENABLE_NAME_LOOKUP: 'false' }, async url => {
    if (url.hostname === 'go-music-api') return okSearch();
    throw Error('Point-song endpoint should not be contacted');
  }, async (base, calls) => {
    const qq = await getSong(base, 'qq');
    assert.equal(qq, undefined);
    const response = await fetch(base + '/api/v1/music/stream?source=qq&id=legacy-qq-abc', { signal: AbortSignal.timeout(5000) });
    assert.equal(response.status, 404);
    assert.ok(calls.every(c => c.url.hostname === 'go-music-api'));
  });
});
