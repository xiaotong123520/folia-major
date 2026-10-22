import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { once } from 'node:events';

const secret = 'test-gateway-secret-which-is-long-enough';
let upstream;
let gateway;
let gatewayPort;
let upstreamPort;

const freePort = async () => {
  const server = http.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
};

before(async () => {
  upstreamPort = await freePort();
  upstream = http.createServer((req, res) => {
    if (req.url?.startsWith('/api/v1/music/stream')) {
      const range = req.headers.range;
      res.writeHead(range ? 206 : 200, {
        'content-type': 'audio/mpeg',
        ...(range ? { 'content-range': 'bytes 0-2/100', 'accept-ranges': 'bytes' } : {}),
      });
      res.end(Buffer.from([1, 2, 3]));
      return;
    }
    const url = new URL(req.url || '/', 'http://upstream.invalid');
    if (url.searchParams.get('q') === 'oversize') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(Buffer.alloc(2_100_000, 65));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ code: 200, data: { songs: [] } }));
  });
  upstream.listen(upstreamPort, '127.0.0.1');
  await once(upstream, 'listening');

  gatewayPort = await freePort();
  gateway = spawn(process.execPath, ['deploy/music-backend-gateway/gateway.mjs'], {
    env: {
      ...process.env,
      PORT: String(gatewayPort),
      MUSIC_BACKEND_API_KEY: secret,
      MUSIC_BACKEND_INTERNAL_URL: `http://127.0.0.1:${upstreamPort}`,
      GATEWAY_MAX_REQUESTS_PER_MINUTE: '120',
    },
    stdio: 'ignore',
  });
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${gatewayPort}/healthz`);
      if (response.ok) { ready = true; break; }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.equal(ready, true, 'gateway should start and become healthy');
});

after(async () => {
  gateway?.kill('SIGTERM');
  if (upstream?.listening) await new Promise(resolve => upstream.close(resolve));
});

const request = (path, options = {}) => fetch(`http://127.0.0.1:${gatewayPort}${path}`, options);
const auth = { authorization: `Bearer ${secret}` };

describe('private music backend gateway', () => {
  it('rejects requests without a bearer token', async () => {
    const response = await request('/api/v1/music/search?q=test');
    assert.equal(response.status, 401);
  });

  it('does not expose cookie or QR login routes', async () => {
    const response = await request('/api/v1/system/cookies', { headers: auth });
    assert.equal(response.status, 404);
  });

  it('rejects unapproved query parameters before forwarding', async () => {
    const response = await request('/api/v1/music/search?q=test&admin=true', { headers: auth });
    assert.equal(response.status, 400);
  });

  it('preserves Range and 206 responses for audio streams', async () => {
    const response = await request('/api/v1/music/stream?id=1&source=netease', {
      headers: { ...auth, range: 'bytes=0-2' },
    });
    assert.equal(response.status, 206);
    assert.equal(response.headers.get('content-range'), 'bytes 0-2/100');
    assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2, 3]);
  });

  it('rejects oversized JSON responses', async () => {
    const response = await request('/api/v1/music/search?q=oversize', { headers: auth });
    assert.equal(response.status, 502);
    assert.match((await response.json()).error, /exceeds 2 MB/);
  });
});
