import { describe, expect, it } from 'vitest';
import { handleAppleMusicToken } from '../../worker/apple-music-token';
import { handleRadioAgent } from '../../worker/radio-agent';

describe('Cloudflare AI route adapters', () => {
    it('requires GET and server-only Apple Music credentials', async () => {
        const wrongMethod = await handleAppleMusicToken(new Request('https://example.test/api/apple-music-token', { method: 'POST' }), {});
        expect(wrongMethod.status).toBe(405);

        const missingConfig = await handleAppleMusicToken(new Request('https://example.test/api/apple-music-token'), {});
        expect(missingConfig.status).toBe(503);
        expect((await missingConfig.json()).code).toBe('APPLE_MUSICKIT_NOT_CONFIGURED');
    });

    it('rejects empty radio prompts before calling an AI provider', async () => {
        const wrongMethod = await handleRadioAgent(new Request('https://example.test/api/radio-agent'), {});
        expect(wrongMethod.status).toBe(405);

        const emptyPrompt = await handleRadioAgent(new Request('https://example.test/api/radio-agent', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ message: '   ' }),
        }), {});
        expect(emptyPrompt.status).toBe(400);
    });
});
