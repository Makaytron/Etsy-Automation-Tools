import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import {
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
  throw new Error('Google Chrome was not found. Set CHROME_PATH to run the MKUI CSS isolation fixture.');
}

function sanitizeCss(css) {
  return String(css)
    .replace(/<\/style/gi, '<\\/style')
    .replace(/\$\{[^}]+\}/g, 'mkui-fixture');
}

async function collectProductionGlobalCss() {
  const blocks = [];
  for (const definition of MKUI_PRODUCTION_SCRIPTS) {
    const source = await readFile(path.resolve(MKUI_ROOT, definition.path), 'utf8');
    for (const body of extractGlobalCssBodies(source)) {
      if (body.kind !== 'global') continue;
      blocks.push({
        script: definition.id,
        label: body.label,
        css: sanitizeCss(body.css),
      });
    }
  }
  return blocks;
}

function fixtureHtml(blocks) {
  const css = blocks
    .map(block => `/* ${block.script}:${block.label} */\n${block.css}`)
    .join('\n\n');
  const properties = JSON.stringify(PROPERTIES);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>MKUI cross-script CSS isolation fixture</title>
<style>${css}</style>
</head>
<body>
  <main id="test-root">
    <button data-probe="button" type="button">Host button</button>
    <input data-probe="input" value="Host input">
    <select data-probe="select"><option>Host select</option></select>
    <div data-probe="div">Host div</div>
  </main>
  <iframe id="control" srcdoc="<!doctype html><html><body><main><button data-probe='button' type='button'>Host button</button><input data-probe='input' value='Host input'><select data-probe='select'><option>Host select</option></select><div data-probe='div'>Host div</div></main></body></html>"></iframe>
  <script>
  (() => {
    const properties = ${properties};
    const snapshot = (documentRef, name) => {
      const node = documentRef.querySelector('[data-probe="' + name + '"]');
      const style = documentRef.defaultView.getComputedStyle(node);
      return Object.fromEntries(properties.map(property => [property, style[property]]));
    };
    const finish = () => {
      const control = document.getElementById('control').contentDocument;
      const names = ['button', 'input', 'select', 'div'];
      const diffs = [];
      const test = {};
      const baseline = {};
      for (const name of names) {
        test[name] = snapshot(document, name);
        baseline[name] = snapshot(control, name);
        for (const property of properties) {
          if (test[name][property] !== baseline[name][property]) {
            diffs.push({
              probe: name,
              property,
              expected: baseline[name][property],
              actual: test[name][property],
            });
          }
        }
      }
      const result = {
        pass: diffs.length === 0,
        styleSheetCount: document.styleSheets.length,
        cssBlockCount: ${blocks.length},
        diffs,
      };
      document.documentElement.setAttribute(
        'data-mkui-result',
        encodeURIComponent(JSON.stringify(result)),
      );
    };
    const frame = document.getElementById('control');
    if (frame.contentDocument?.readyState === 'complete') finish();
    else frame.addEventListener('load', finish, { once: true });
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
      '--virtual-time-budget=2000',
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
    const encoded = dom.match(/data-mkui-result="([^"]+)"/)?.[1];
    assert.ok(encoded, 'Browser fixture did not publish a CSS-isolation result.');
    const result = JSON.parse(decodeURIComponent(encoded.replaceAll('&amp;', '&')));
    assert.equal(
      result.pass,
      true,
      `Global MKUI CSS changed host controls:\n${JSON.stringify(result.diffs, null, 2)}`,
    );
    assert.equal(result.cssBlockCount, blocks.length);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
