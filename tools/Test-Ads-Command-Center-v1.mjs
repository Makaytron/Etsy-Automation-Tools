import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  MARKER,
  applyAdsCommandCenter,
  commandCenterCss,
} from './Apply-Ads-Command-Center-v1.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const SCRIPT_PATH = resolve(
  ROOT,
  'scripts/etsy-ads-keyword-manager/Makaytron-Etsy-Ads-Keyword-Manager.user.js',
);

function metadata(source) {
  return source.match(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/)?.[0] || '';
}

function dataHookSignature(source) {
  return [...new Set(
    [...source.matchAll(/\bdata-([a-z0-9_-]+)\s*=\s*["']/gi)].map(match => match[1]),
  )].sort();
}

test('guarded transform adds one registered-source command-center layer', async () => {
  const production = await readFile(SCRIPT_PATH, 'utf8');
  const fixture = production.includes(MARKER)
    ? "const CSS = `:host{--maw-radius-lg:14px}.maw-panel{width:372px}`;"
    : production;
  const output = applyAdsCommandCenter(fixture);
  assert.equal(output.split(MARKER).length - 1, 1);
  assert.match(output, /template\.shell\.base-layout/);
  assert.match(output, /template\.shell\.site-header/);
  assert.match(output, /template\.primitive\.card/);
  assert.match(output, /template\.primitive\.button/);
  assert.match(output, /template\.primitive\.table/);
  assert.match(output, /shadcn\.dashboard\.applied/);
  assert.match(output, /shadcn\.blocks\.application-interface/);
  assert.match(output, /Application Interface 2/);
  assert.match(output, /shadcn\.blocks\.datatable/);
  assert.match(output, /Data Table 2/);
});

test('command center fixes the narrow panel and preserves responsive hierarchy', async () => {
  const production = await readFile(SCRIPT_PATH, 'utf8');
  const css = commandCenterCss(production);
  assert.match(css, /width:min\(680px,calc\(100vw - 24px\)\)!important/);
  assert.match(css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /@container \(min-width:600px\)/);
  assert.match(css, /@media\(max-width:720px\)/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css, /white-space:normal!important/);
  assert.match(css, /data-action\*="disable-all"/);
  assert.match(css, /position:sticky/);
});

test('production script contains the applied layer exactly once and remains idempotent', async () => {
  const source = await readFile(SCRIPT_PATH, 'utf8');
  assert.equal(source.split(MARKER).length - 1, 1);
  assert.equal(applyAdsCommandCenter(source), source);
});

test('presentation transform does not alter userscript metadata or existing HTML data hooks', async () => {
  const source = await readFile(SCRIPT_PATH, 'utf8');
  const cleanFixture = "// ==UserScript==\n// @name fixture\n// ==/UserScript==\nconst view = '<button data-action=\"scan\" data-state=\"ready\">Run</button>';\nconst CSS = `:host{--maw-radius-lg:14px}.maw-panel{width:372px}`;";
  const output = applyAdsCommandCenter(cleanFixture);
  assert.equal(metadata(output), metadata(cleanFixture));
  assert.deepEqual(dataHookSignature(output), dataHookSignature(cleanFixture));
});

test('transient feedback remains explicitly out of scope for this presentation pass', async () => {
  const source = await readFile(SCRIPT_PATH, 'utf8');
  const markerOffset = source.indexOf(MARKER);
  assert.ok(markerOffset >= 0);
  const excerpt = source.slice(markerOffset, markerOffset + 1800);
  assert.match(excerpt, /Toast mapping: N\/A/);
  assert.doesNotMatch(excerpt, /toast\.(?:container|item|styles)/);
});
