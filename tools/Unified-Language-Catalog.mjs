// The unified script's interface text as one flat catalog, and the checks
// every language pack in languages/ must pass.
//
// English and Turkish are bundled in the script. Every other language is a
// pack (languages/<code>.json) downloaded once the user chooses it. Shell
// keys keep their names ("ws.report"); tool screen keys get a prefix
// ("sale.start", "ads.closePage", ...), the same one the screens look up.
//
//   node tools/Unified-Language-Catalog.mjs --source   prints the English catalog
//   node tools/Unified-Language-Catalog.mjs --check    checks every pack

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LANGUAGES_DIR = path.join(repoRoot, 'languages');
const load = (rel) => import(pathToFileURL(path.join(repoRoot, rel)).href);

export const TOOL_TABLES = Object.freeze([
  ['sale', 'src/modules/sale-manager-ui.js', 'SALE_STRINGS'],
  ['ads', 'src/modules/ads-keyword-manager-ui.js', 'ADS_STRINGS'],
  ['kw', 'src/modules/keyword-market-analyzer-ui.js', 'KW_STRINGS'],
  ['ma', 'src/modules/message-assistant-ui.js', 'MA_STRINGS'],
  ['la', 'src/modules/listing-analyzer-ui.js', 'LA_STRINGS'],
]);

/** Flat catalog for a bundled language ('en' or 'tr'). */
export async function catalog(language = 'en') {
  const { UI_STRINGS } = await load('src/ui/strings.js');
  const { WORKSPACE_STRINGS } = await load('src/ui/strings-workspace.js');
  const out = {};
  for (const table of [UI_STRINGS, WORKSPACE_STRINGS]) {
    for (const [key, value] of Object.entries(table[language])) {
      if (key in out) throw new Error(`Duplicate shell key: ${key}`);
      out[key] = value;
    }
  }
  for (const [prefix, file, name] of TOOL_TABLES) {
    const table = (await load(file))[name];
    for (const [key, value] of Object.entries(table[language])) out[`${prefix}.${key}`] = value;
  }
  return out;
}

const placeholders = (text) => [...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

/** Problems with one pack against the English catalog; empty when it is fine. */
export async function checkPack(code, pack, source) {
  const { validatePack } = await load('src/core/i18n.js');
  const { PACK_LANGUAGES, PACK_MIN_APP_VERSION } = await load('src/core/language-packs.js');
  const { META } = await load('src/meta.js');
  const problems = [];
  if (!PACK_LANGUAGES.includes(code)) problems.push(`${code}: not in PACK_LANGUAGES`);
  try { validatePack(pack, { language: code, appVersion: META.version }); } catch (error) { problems.push(`${code}: ${error.code}`); }
  if (pack?.minAppVersion !== PACK_MIN_APP_VERSION) problems.push(`${code}: minAppVersion must be ${PACK_MIN_APP_VERSION}`);
  const strings = pack?.strings ?? {};
  for (const key of Object.keys(source)) {
    if (typeof strings[key] !== 'string' || !strings[key].trim()) problems.push(`${code}: missing ${key}`);
    else if (placeholders(strings[key]) !== placeholders(source[key])) problems.push(`${code}: placeholders differ in ${key}`);
  }
  for (const key of Object.keys(strings)) if (!(key in source)) problems.push(`${code}: unknown key ${key}`);
  return problems;
}

export async function checkAll() {
  const source = await catalog('en');
  const { PACK_LANGUAGES } = await load('src/core/language-packs.js');
  const problems = [];
  const files = fs.readdirSync(LANGUAGES_DIR).filter((f) => f.endsWith('.json')).sort();
  const codes = files.map((f) => f.slice(0, -5));
  for (const code of PACK_LANGUAGES) if (!codes.includes(code)) problems.push(`${code}: pack file missing`);
  for (const file of files) {
    const code = file.slice(0, -5);
    const raw = fs.readFileSync(path.join(LANGUAGES_DIR, file), 'utf8');
    let pack;
    try { pack = JSON.parse(raw); } catch { problems.push(`${code}: not valid JSON`); continue; }
    problems.push(...await checkPack(code, pack, source));
  }
  return problems;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--source')) {
    process.stdout.write(`${JSON.stringify(await catalog('en'), null, 2)}\n`);
  } else {
    const problems = await checkAll();
    if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
    console.log('PASS language packs: every pack matches the English catalog.');
  }
}
