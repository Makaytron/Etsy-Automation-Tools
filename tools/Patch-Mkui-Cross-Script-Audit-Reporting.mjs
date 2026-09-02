import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'tools/Audit-Mkui-Cross-Script-Coexistence.mjs');
const original = fs.readFileSync(target, 'utf8');
const failureBlock = "const failed = Object.entries(assertions).filter(([, passed]) => !passed).map(([name]) => name);\nif (failed.length) throw new Error(`Cross-script source audit failed: ${failed.join(', ')}`);\n\nconst audit = {";
const delayedBlock = "const failed = Object.entries(assertions).filter(([, passed]) => !passed).map(([name]) => name);\n\nconst audit = {";
let output = original;
if (output.includes(failureBlock)) output = output.replace(failureBlock, delayedBlock);
else if (!output.includes(delayedBlock)) throw new Error('Unable to locate audit failure block');

const ending = "} else {\n  process.stdout.write(json);\n}\n";
const replacement = "} else {\n  process.stdout.write(json);\n}\n\nif (failed.length) throw new Error(`Cross-script source audit failed: ${failed.join(', ')}`);\n";
if (output.includes(ending) && !output.includes("if (failed.length) throw new Error(`Cross-script source audit failed: ${failed.join(', ')}`);\n", output.indexOf(ending) + ending.length)) {
  output = output.replace(ending, replacement);
} else if (!output.endsWith(replacement)) {
  throw new Error('Unable to locate audit output block');
}
fs.writeFileSync(target, output, 'utf8');
console.log('Cross-script audit now writes its report before failing.');
