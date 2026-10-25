import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// Every product release carries concrete, versioned notes for the App's update dialog.
const path = 'public/app-updates.json';
const notice = JSON.parse(readFileSync(path, 'utf8'));
if (typeof notice.id !== 'string' || !notice.id || notice.id.length > 100
    || typeof notice.version !== 'string' || !notice.version || notice.version.length > 80
    || !Array.isArray(notice.changes) || !notice.changes.length || notice.changes.length > 12
    || notice.changes.some(text => typeof text !== 'string' || !text || text.length > 500)) {
    throw new Error('App update notice needs an id, version and concrete change list');
}
let previous;
let changed;
try {
    changed = execFileSync('git', ['diff', '--name-only', 'HEAD^', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split('\n');
    previous = JSON.parse(execFileSync('git', ['show', `HEAD^:${path}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
} catch { /* First release or a shallow export: validate the manifest's schema above. */ }
if (previous && changed?.some(file => /^(src\/|api(?:-ts)?\/|packaging\/ios\/)/.test(file))) {
    if (previous.id === notice.id || JSON.stringify(previous.changes) === JSON.stringify(notice.changes)) {
        throw new Error('Product code changed: update public/app-updates.json with a new id and actual release notes');
    }
}
