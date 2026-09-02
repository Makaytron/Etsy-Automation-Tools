import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import {
  extractCssSelectors,
  extractGlobalCssBodies,
} from './Audit-Mkui-Cross-Script-Coexistence.mjs';
import {
  MKUI_PRODUCTION_SCRIPTS,
  MKUI_ROOT,
} from './Mkui-Production-Registry.mjs';

const PROPERTIES = Object.freeze([
  'backgroundColor',
  'borderBottomColor',
  'borderBottomStyle',
  'borderBottomWidth',
  'borderRadius',
  'boxSizing',
  'color',
  'display',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'marginBottom',
  'marginLeft',
  'marginRight',
  'marginTop',
  'paddingBottom',
  'paddingLeft',
  'paddingRight',
  'paddingTop',
  'position',
]);

function chromeCandidates() {
  return [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA &&
      path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.platform === 'darwin' &&
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    process.platform === 'linux' && '/usr/bin/google-chrome',
    process.platform === 'linux' && '/usr/bin/google-chrome-stable',
    process.platform === 'linux' && '/usr/bin/chromium',
  ].filter(Boolean);
}

async function findChrome() {
  for (const candidate of chromeCandidates()) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Continue through the standard installation paths.
    }
  }
  throw new Error(
    'Google Chrome was not found. Set CHROME_PATH to run the MKUI CSS isolation fixture.',
  );
}

function sanitizeCss(css) {
  return String(css)
    .replace(/\$\{[^}]+\}/g, 'mkui-fixture')
    .replace(/<\/script/gi, '<\\/script');
}

async function collectProductionGlobalCss() {
  const blocks = [];
  for (const definition of MKUI_PRODUCTION_SCRIPTS) {
    const source = await readFile(path.resolve(MKUI_ROOT, definition.path), 'utf8');
    for (const body of extractGlobalCssBodies(source)) {
      if (body.kind !== 'global') continue;
      const css = sanitizeCss(body.css);
      const selectors = extractCssSelectors(css);
      if (!selectors.length) continue;
      blocks.push({
        script: definition.id,
        label: body.label,
        css,
        selectorCount: selectors.length,
      });
    }
  }
  return blocks;
}

function safeJavascriptString(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function fixtureHtml(blocks) {
  const css = blocks
    .map(block => `/* ${block.script}:${block.label} */\n${block.css}`)
    .join('\n\n');
  const properties = JSON.stringify(PROPERTIES);
  const cssLiteral = safeJavascriptString(css);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>MKUI cross-script CSS isolation fixture</title>
</head>
<body>
  <main id="test-root">
    <button data-probe="button" type="button">Host button</button>
    <input data-probe="input" value="Host input">
    <select data-probe="select"><option>Host select</option></select>
    <div data-probe="div">Host div</div>
  </main>
  <script>
  (() => {
    try {
      const properties = ${properties};
      const names = ['button', 'input', 'select', 'div'];
      const snapshot = name => {
        const node = document.querySelector('[data-probe="' + name + '"]');
        const style = getComputedStyle(node);
        return Object.fromEntries(properties.map(property => [property, style[property]]));
      };
      const baseline = Object.fromEntries(names.map(name => [name, snapshot(name)]));
      const style = document.createElement('style');
      style.setAttribute('data-mkui-production-css', '');
      style.textContent = ${cssLiteral};
      document.head.appendChild(style);
      const actual = Object.fromEntries(names.map(name => [name, snapshot(name)]));
      const diffs = [];
      for (const name of names) {
        for (const property of properties) {
          if (actual[name][property] !== baseline[name][property]) {
            diffs.push({
              probe: name,
              property,
              expected: baseline[name][property],
              actual: actual[name][property],
            });
          }
        }
      }
      const result = {
        pass: diffs.length === 0,
        styleSheetCount: document.styleSheets.length,
        cssBlockCount: ${blocks.length},
        selectorCount: ${blocks.reduce((total, block) => total + block.selectorCount, 0)},
        diffs,
      };
      document.documentElement.setAttribute(
        'data-mkui-result',
        encodeURIComponent(JSON.stringify(result)),
      );
    } catch (error) {
      document.documentElement.setAttribute(
        'data-mkui-error',
        encodeURIComponent(String(error && (error.stack || error.message) || error)),
      );
    }
  })();
  </script>
</body>
</html>`;
}

function runChrome(executable, fileUrl) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [
      '--headless=new',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-extensions',
      '--disable-features=Translate,MediaRouter',
      '--disable-gpu',
      '--disable-sync',
      '--metrics-recording-only',
      '--no-first-run',
      '--no-default-browser-check',
      '--no-sandbox',
      '--allow-file-access-from-files',
      '--virtual-time-budget=1000',
      '--dump-dom',
      fileUrl,
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.once('error', reject);
    child.once('exit', code => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`Chrome exited with code ${code}.\n${stderr}`));
    });
  });
}

test('production global CSS leaves native Etsy host controls unchanged', async () => {
  const chrome = await findChrome();
  const blocks = await collectProductionGlobalCss();
  assert.ok(blocks.length >= 4, 'Expected global CSS from the migrated production scripts.');

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'mkui-cross-script-css-'));
  const fixturePath = path.join(tempRoot, 'index.html');
  try {
    await writeFile(fixturePath, fixtureHtml(blocks), 'utf8');
    const dom = await runChrome(chrome, pathToFileURL(fixturePath).href);
    const encodedError = dom.match(/data-mkui-error="([^"]+)"/)?.[1];
    assert.equal(
      encodedError,
      undefined,
      encodedError ? decodeURIComponent(encodedError.replaceAll('&amp;', '&')) : '',
    );
    const encoded = dom.match(/data-mkui-result="([^"]+)"/)?.[1];
    assert.ok(
      encoded,
      `Browser fixture did not publish a CSS-isolation result. DOM tail:\n${dom.slice(-1600)}`,
    );
    const result = JSON.parse(decodeURIComponent(encoded.replaceAll('&amp;', '&')));
    assert.equal(
      result.pass,
      true,
      `Global MKUI CSS changed host controls:\n${JSON.stringify(result.diffs, null, 2)}`,
    );
    assert.equal(result.cssBlockCount, blocks.length);
    assert.ok(result.selectorCount > 0);
    assert.ok(result.styleSheetCount >= 1);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
