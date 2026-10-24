import { rolldown } from 'rolldown';
import { rm } from 'node:fs/promises';

// Keep the podcast helpers inside one serverless entry, rather than publishing helper routes.
const bundle = await rolldown({ input: 'api-ts/podcast.ts', platform: 'node',
    external: id => id.startsWith('node:') || id === 'qrcode' });
await bundle.write({ file: 'api/podcast.js', format: 'esm', minify: false });
await bundle.close();
await rm('api/xiaoyuzhou', { recursive: true, force: true });
