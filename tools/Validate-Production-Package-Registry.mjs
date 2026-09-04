import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MKUI_PRODUCTION_SCRIPTS } from './Mkui-Production-Registry.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const registryPath = path.join(repoRoot, 'config', 'production-packages.json');
const distributionPath = path.join(repoRoot, 'DISTRIBUTION.md');
const distributionGatePath = path.join(repoRoot, 'tools', 'Test-Distribution.ps1');
const expectedCount = 5;

function fail(message) {
  throw new Error(message);
}

function collectUserscripts(directory) {
  const results = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectUserscripts(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.user.js')) {
      results.push(path.relative(repoRoot, fullPath).replaceAll(path.sep, '/'));
    }
  }
  return results.sort();
}

if (!fs.existsSync(registryPath)) fail('config/production-packages.json is missing.');
let registry;
try {
  registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
} catch (error) {
  fail(`Production package registry is invalid JSON: ${error.message}`);
}
if (!Array.isArray(registry)) fail('Production package registry must be a JSON array.');
if (registry.length !== expectedCount) {
  fail(`Production package registry must contain exactly ${expectedCount} packages; found ${registry.length}.`);
}

const uniqueFields = ['id', 'packageSlug', 'publicName', 'scriptPath', 'greasyForkId', 'greasyForkSlug'];
for (const field of uniqueFields) {
  const values = registry.map((entry) => entry?.[field]);
  if (new Set(values).size !== values.length) fail(`Production package registry contains duplicate ${field} values.`);
}

for (const entry of registry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) fail('Every production package registry entry must be an object.');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id ?? '')) fail(`Invalid production id: ${entry.id ?? 'missing'}`);
  if (!/^etsy-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.packageSlug ?? '')) fail(`Invalid packageSlug: ${entry.packageSlug ?? 'missing'}`);
  if (typeof entry.publicName !== 'string' || !entry.publicName.startsWith('Makaytron Etsy ')) fail(`Invalid publicName for ${entry.packageSlug}.`);
  if (!Number.isInteger(entry.greasyForkId) || entry.greasyForkId <= 0) fail(`Invalid greasyForkId for ${entry.packageSlug}.`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.greasyForkSlug ?? '')) fail(`Invalid greasyForkSlug for ${entry.packageSlug}.`);

  const expectedPrefix = `scripts/${entry.packageSlug}/`;
  if (typeof entry.scriptPath !== 'string' || !entry.scriptPath.startsWith(expectedPrefix) || !entry.scriptPath.endsWith('.user.js')) {
    fail(`${entry.packageSlug}: scriptPath must point to one .user.js directly under its package directory.`);
  }
  if (entry.scriptPath.slice(expectedPrefix.length).includes('/')) fail(`${entry.packageSlug}: scriptPath must not contain nested package directories.`);

  const fullScriptPath = path.join(repoRoot, ...entry.scriptPath.split('/'));
  if (!fs.existsSync(fullScriptPath) || !fs.statSync(fullScriptPath).isFile()) fail(`${entry.packageSlug}: registered userscript is missing: ${entry.scriptPath}`);
  const source = fs.readFileSync(fullScriptPath, 'utf8');
  const names = [...source.matchAll(/^\/\/\s+@name\s+(.+?)\s*$/gm)].map((match) => match[1]);
  if (names.length !== 1 || names[0] !== entry.publicName) {
    fail(`${entry.packageSlug}: @name must be exactly "${entry.publicName}".`);
  }
}

const actualUserscripts = collectUserscripts(path.join(repoRoot, 'scripts'));
const registeredUserscripts = registry.map((entry) => entry.scriptPath).sort();
if (JSON.stringify(actualUserscripts) !== JSON.stringify(registeredUserscripts)) {
  const missing = actualUserscripts.filter((value) => !registeredUserscripts.includes(value));
  const stale = registeredUserscripts.filter((value) => !actualUserscripts.includes(value));
  fail(`Production userscript inventory drift. Unregistered: ${missing.join(', ') || 'none'}; missing registered: ${stale.join(', ') || 'none'}.`);
}

const mkuiPairs = MKUI_PRODUCTION_SCRIPTS.map((entry) => `${entry.id}\t${entry.path}`).sort();
const registryPairs = registry.map((entry) => `${entry.id}\t${entry.scriptPath}`).sort();
if (JSON.stringify(mkuiPairs) !== JSON.stringify(registryPairs)) {
  fail('MKUI production registry id/path inventory does not match config/production-packages.json.');
}

const distributionSource = fs.readFileSync(distributionPath, 'utf8');
const documentedGreasyForkListings = [...distributionSource.matchAll(/^- \[([^\]\r\n]+)\]\(https:\/\/greasyfork\.org\/en\/scripts\/(\d+)-([a-z0-9-]+)\)\s*$/gm)]
  .map((match) => `${match[1]}\t${match[2]}\t${match[3]}`)
  .sort();
const expectedGreasyForkListings = registry
  .map((entry) => `${entry.publicName}\t${entry.greasyForkId}\t${entry.greasyForkSlug}`)
  .sort();
if (JSON.stringify(documentedGreasyForkListings) !== JSON.stringify(expectedGreasyForkListings)) {
  fail('DISTRIBUTION.md Greasy Fork labels/ids/slugs do not match config/production-packages.json.');
}

const distributionGateSource = fs.readFileSync(distributionGatePath, 'utf8');
if (!distributionGateSource.includes("config/production-packages.json")) {
  fail('tools/Test-Distribution.ps1 must load config/production-packages.json instead of maintaining a separate production mapping.');
}
if (/\bId\s*=\s*58984\d\b/.test(distributionGateSource)) {
  fail('tools/Test-Distribution.ps1 still contains hard-coded Greasy Fork ids; use the production package registry.');
}

console.log(`PASS production package registry: ${registry.length} packages, filesystem/MKUI/docs/distribution mapping aligned.`);
