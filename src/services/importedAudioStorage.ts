import Dexie, { type Table } from 'dexie';

// Keep selected audio bytes, never session-only blob URLs, across browser restarts.
export interface SavedAudioTrack {
    id: string;
    name: string;
    createdAt: number;
    file?: Blob;
    url?: string;
}

export class ImportedAudioDatabase extends Dexie {
    tracks!: Table<SavedAudioTrack, string>;

    constructor(name = 'TongshengImportedAudio') {
        super(name);
        this.version(1).stores({ tracks: 'id, createdAt' });
    }
}

export const importedAudioDatabase = new ImportedAudioDatabase();

// Serialize writes so clearing/removing while a large file is saving cannot resurrect it.
let writes: Promise<unknown> = Promise.resolve();
export function writeImportedAudio(action: () => Promise<unknown>): Promise<void> {
    const next = writes.catch(() => undefined).then(action);
    writes = next;
    return next.then(() => undefined);
}
