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

function currentVersions() {
  const metadata = source.match(/^\/\/ @version\s+(\d+\.\d+\.\d+)\s*$/m)?.[1];
  const runtime = source.match(/^\s*const APP_VERSION\s*=\s*['"](\d+\.\d+\.\d+)['"]\s*;\s*$/m)?.[1];
  assert.ok(metadata, 'Message Assistant @version is missing or not strict SemVer');
  assert.ok(runtime, 'Message Assistant APP_VERSION is missing or not strict SemVer');
  return { metadata, runtime };
}

function hasTemplateAttribute(attribute, value) {
  return source.includes(`${attribute}="${value}"`)
    || source.includes(String.raw`${attribute}=\"${value}\"`)
    || source.includes(`${attribute}='${value}'`)
    || source.includes(String.raw`${attribute}=\'${value}\'`);
}

test('Message Assistant keeps protected UI architecture after MKUI migration', () => {
  assert.equal(count("attachShadow({ mode: 'closed' })"), 1, 'closed Shadow DOM mount must remain singular');
  assert.equal(count('const PREMIUM_CSS = `'), 1, 'PREMIUM_CSS layer must remain present');
  assert.equal(count('const GLOBAL_CSS = `'), 1, 'GLOBAL_CSS Etsy integration layer must remain present');
  assert.match(source, /const CSS = `:host\{/);
  assert.match(source, /const LAUNCHER_CSS = `/);
  assert.match(source, /const UX_CSS = `/);
  assert.ok(hasTemplateAttribute('data-action', 'toggle-app'), 'launcher toggle-app hook must remain present');
  assert.ok(hasTemplateAttribute('data-action', 'toggle-wide'), 'wide/fullscreen toggle hook must remain present');
  assert.ok(source.includes("['settings', 'settings', 'Ayarlar']"), 'settings navigation definition must remain present');
  assert.match(source, /data-page=\\?["']\$\{id\}\\?["']/, 'dynamic data-page navigation binding must remain present');
  assert.ok(source.includes('if (target.dataset.page) { this.state.page = target.dataset.page; return this.refreshCurrent(); }'), 'data-page click routing must remain present');
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

test('Message Assistant current production version stays synchronized with MKUI invariants', () => {
  const { metadata, runtime } = currentVersions();
  assert.equal(runtime, metadata, 'APP_VERSION must equal userscript @version');
  assert.ok(source.includes("const MKUI_VERSION = '1.0.0';"), 'MKUI production marker is missing');
  assert.ok(source.includes('--ma-accent:#525252'));
  assert.ok(source.includes('--ma-line:#dedede'));
  assert.ok(source.includes('--ma-bg:#f5f5f5'));
});
