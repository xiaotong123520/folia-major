import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { ImportedAudioDatabase, writeImportedAudio } from '../../src/services/importedAudioStorage';

const names: string[] = [];
afterEach(async () => {
    for (const name of names.splice(0)) await new ImportedAudioDatabase(name).delete();
});

describe('persistent browser imports', () => {
    it('reopens actual audio bytes and HTTPS URLs instead of expired blob URLs', async () => {
        const name = `import-test-${crypto.randomUUID()}`;
        names.push(name);
        const db = new ImportedAudioDatabase(name);
        await db.tracks.bulkPut([
            { id: 'local', name: 'Song.wav', file: new Blob(['RIFF-test-audio'], { type: 'audio/wav' }), createdAt: 1 },
            { id: 'remote', name: 'Stream', url: 'https://example.com/a.mp3', createdAt: 2 },
        ]);
        db.close();
        const reopened = new ImportedAudioDatabase(name);
        const saved = await reopened.tracks.orderBy('createdAt').toArray();
        expect(await saved[0].file?.text()).toBe('RIFF-test-audio');
        expect(saved[0].url).toBeUndefined();
        expect(saved[1].url).toBe('https://example.com/a.mp3');
        reopened.close();
    });

    it('keeps clear after an earlier pending import, including after a failed write', async () => {
        const result: string[] = [];
        const first = writeImportedAudio(async () => { result.push('add'); throw new Error('quota'); });
        const cleared = writeImportedAudio(async () => { result.length = 0; });
        await expect(first).rejects.toThrow('quota');
        await cleared;
        expect(result).toEqual([]);
    });
});
