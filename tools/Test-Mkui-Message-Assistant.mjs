import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scriptPath = path.join(repoRoot, 'scripts/etsy-message-assistant/Makaytron-Etsy-Message-Assistant.user.js');
const source = fs.readFileSync(scriptPath, 'utf8');

function count(needle) {
  return source.split(needle).length - 1;
}

test('Message Assistant keeps protected UI architecture before/after MKUI mapping', () => {
  assert.equal(count("attachShadow({ mode: 'closed' })"), 1, 'closed Shadow DOM mount must remain singular');
  assert.equal(count('const PREMIUM_CSS = `'), 1, 'PREMIUM_CSS layer must remain present during first migration');
  assert.equal(count('const GLOBAL_CSS = `'), 1, 'GLOBAL_CSS Etsy integration layer must remain present');
  assert.match(source, /const CSS = `:host\{/);
  assert.match(source, /const LAUNCHER_CSS = `/);
  assert.match(source, /const UX_CSS = `/);
  assert.match(source, /data-action=\\?"toggle-app\\?"/);
  assert.match(source, /data-action=\\?"toggle-wide\\?"/);
  assert.match(source, /data-action=\\?"settings\\?"/);
});

test('Message Assistant protected userscript metadata remains intact', () => {
  for (const line of [
    '// @match        https://www.etsy.com/messages*',
    '// @match        https://www.etsy.com/conversations*',
    '// @match        https://www.etsy.com/your/orders/sold*',
    '// @match        https://www.etsy.com/your/shops/*/dashboard*',
    '// @grant        GM.xmlHttpRequest',
    '// @grant        GM.addStyle',
    '// @grant        GM.getResourceURL',
    '// @connect      api.openai.com',
    '// @connect      api.anthropic.com',
    '// @connect      generativelanguage.googleapis.com',
    '// @connect      raw.githubusercontent.com',
  ]) assert.ok(source.includes(line), `missing protected metadata: ${line}`);
});

test('Message Assistant MKUI migration is versioned explicitly when applied', () => {
  const applied = source.includes("const MKUI_VERSION = '1.0.0';");
  if (applied) {
    assert.ok(source.includes('// @version      1.2.9'));
    assert.ok(source.includes("const APP_VERSION = '1.2.9';"));
    assert.ok(source.includes('--ma-accent:#525252'));
    assert.ok(source.includes('--ma-line:#dedede'));
    assert.ok(source.includes('--ma-bg:#f5f5f5'));
  } else {
    assert.ok(source.includes('// @version      1.2.8'));
    assert.ok(source.includes("const APP_VERSION = '1.2.8';"));
  }
});
