const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

// Check ownership/clock handoff without a browser login, Apple account or live music source.
function fixture(origin = 'https://folia-major-ai-radio-preview.vercel.app') {
    const listeners = new Map();
    const messages = [];
    const events = [];
    class Media {
        currentSrc = 'https://audio.example/test.mp3';
        src = this.currentSrc;
        currentTime = 42;
        playbackRate = 1;
        volume = 0.7;
        paused = false;
        ended = false;
        muted = false;
        loop = false;
        dataset = {};
        pause() { this.paused = true; listeners.get('pause')?.({ type: 'pause', target: this }); }
        play() { this.paused = false; listeners.get('playing')?.({ type: 'playing', target: this }); return Promise.resolve(); }
        dispatchEvent(event) { events.push(event.type); }
    }
    const window = { location: { origin }, dispatchEvent: event => events.push(event.type),
        webkit: { messageHandlers: { tingyuNativeAudio: { postMessage: message => { messages.push(message); return Promise.resolve({ ready: true }); } } } } };
    class Reader {
        readAsDataURL(blob) {
            blob.arrayBuffer().then(buffer => {
                this.result = 'data:audio/mpeg;base64,' + Buffer.from(buffer).toString('base64');
                this.onload?.();
            });
        }
    }
    const context = { window, FileReader: Reader, fetch: async () => new Response(new Uint8Array(70000), { headers: { 'Content-Type': 'audio/mpeg' } }), navigator: { mediaSession: { metadata: { title: 'Test', artist: 'Artist', artwork: [] } } },
        HTMLMediaElement: Media, document: { addEventListener: (name, callback) => listeners.set(name, callback) },
        setInterval: () => 0, Event: class { constructor(type) { this.type = type; } } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'TingyuFM/NativeAudioBridge.js'), 'utf8'), context);
    const audio = new Media();
    return { window, messages, events, audio, listeners };
}

test('native audio is absent outside the first-party origin', () => {
    assert.equal(fixture('https://other.example').window.__tingyuNativeAudio, undefined);
});
test('handoff pauses only the web deck and restores native time with the audio graph recovery event', async () => {
    const f = fixture();
    f.listeners.get('playing')({ type: 'playing', target: f.audio });
    await Promise.resolve(); await Promise.resolve();
    assert.ok(f.messages.some(message => message.action === 'source'));
    assert.equal(f.window.__tingyuNativeAudio.handoff(), true);
    await Promise.resolve();
    const count = f.messages.length;
    f.window.__tingyuNativeAudio.hold('1');
    assert.equal(f.audio.paused, true);
    assert.equal(f.messages.length, count);
    await f.window.__tingyuNativeAudio.restore({ id: '1', time: 58, playing: true, ended: false });
    assert.equal(f.audio.currentTime, 58);
    assert.equal(f.audio.paused, false);
    assert.ok(f.events.includes('tingyu:native-audio-restored'));
});
test('a native pause does not become an automatic resume, and another source is never sought', async () => {
    const f = fixture();
    f.listeners.get('playing')({ type: 'playing', target: f.audio });
    await Promise.resolve();
    f.window.__tingyuNativeAudio.handoff();
    f.window.__tingyuNativeAudio.hold('1');
    await f.window.__tingyuNativeAudio.restore({ id: '1', time: 60, playing: false, ended: false });
    assert.equal(f.audio.paused, true);
    assert.equal(f.window.__tingyuNativeAudio.handoff(), false);
    await f.window.__tingyuNativeAudio.restore({ id: 'old-source', time: 3, playing: true });
    assert.equal(f.audio.currentTime, 60);
});
test('buffered audio is transferred in bounded chunks with the same authorised fallback and app volume', async () => {
    const f = fixture();
    f.audio.currentSrc = 'blob:buffered';
    f.audio.dataset = { tingyuStreamUrl: 'https://audio.example/authorised', tingyuVolume: '0.25' };
    f.listeners.get('playing')({ type: 'playing', target: f.audio });
    for (let i = 0; i < 20 && !f.messages.some(message => message.action === 'finish'); i++) await new Promise(setImmediate);
    const begin = f.messages.find(message => message.action === 'begin');
    assert.equal(begin.size, 70000);
    assert.equal(begin.fallback, 'https://audio.example/authorised');
    assert.equal(begin.state.volume, 0.25);
    const chunks = f.messages.filter(message => message.action === 'chunk');
    assert.deepEqual(chunks.map(message => message.offset), [0, 65536]);
    assert.ok(chunks.every(message => message.data.length <= 90000));
    assert.ok(f.messages.some(message => message.action === 'finish'));
});
