import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const block = (await readFile(path.join(root, 'shared/lifecycle/spa-lifecycle.js'), 'utf8')).trimEnd();
const products = JSON.parse(await readFile(path.join(root, 'config/production-packages.json'), 'utf8'));
const startMarker = '    // BEGIN SPA LIFECYCLE';
const endMarker = '    // END SPA LIFECYCLE';
for (const product of products) {
    const file = path.join(root, product.scriptPath);
    const source = await readFile(file, 'utf8');
    if (source.split(startMarker).length !== 2 || source.split(endMarker).length !== 2) throw new Error(`Ambiguous lifecycle markers: ${product.id}`);
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker) + endMarker.length;
    if (source.slice(start, end) === block) continue;
    if (!process.argv.includes('--write')) throw new Error(`Lifecycle drift in ${product.id}; run node tools/Sync-SPA-Lifecycle.mjs --write`);
    await writeFile(file, source.slice(0, start) + block + source.slice(end), 'utf8');
}
console.log('PASS shared SPA lifecycle: all registered production scripts synchronized.');
