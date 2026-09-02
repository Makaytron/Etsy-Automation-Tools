import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { MARKER } from './Apply-Ads-Command-Center-v1.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const SCRIPT_PATH = resolve(
  ROOT,
  'scripts/etsy-ads-keyword-manager/Makaytron-Etsy-Ads-Keyword-Manager.user.js',
);
const LOGO_PATH = resolve(ROOT, 'assets/makaytron-logo.png');
const OUTPUT_PATH = resolve(
  ROOT,
  'docs/design/previews/ads-keyword-manager-command-center-v1.html',
);

function findTemplateLiteralBounds(source, offset) {
  let start = -1;
  for (let index = offset; index >= 0; index -= 1) {
    if (source[index] !== '`') continue;
    let slashCount = 0;
    for (let cursor = index - 1; cursor >= 0 && source[cursor] === '\\'; cursor -= 1) {
      slashCount += 1;
    }
    if (slashCount % 2 === 0) {
      start = index;
      break;
    }
  }
  if (start < 0) throw new Error('Unable to locate production CSS template start.');
  for (let index = offset; index < source.length; index += 1) {
    if (source[index] !== '`') continue;
    let slashCount = 0;
    for (let cursor = index - 1; cursor > start && source[cursor] === '\\'; cursor -= 1) {
      slashCount += 1;
    }
    if (slashCount % 2 === 0) return { start, end: index };
  }
  throw new Error('Unable to locate production CSS template end.');
}

function escapeStyleText(value) {
  return value.replace(/<\/style/gi, '<\\/style');
}

function previewDocument(css, logoDataUrl) {
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Makaytron Etsy Ads Keyword Manager — Command Center v1</title>
<style>
html,body{margin:0;min-height:100%;background:#e9e9e9;font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#171717}
body{display:grid;place-items:center;padding:28px;box-sizing:border-box}
body:before{content:"NETWORK-ISOLATED SYNTHETIC PREVIEW";position:fixed;left:20px;bottom:16px;color:#686868;font:750 10px/1.2 system-ui,sans-serif;letter-spacing:.08em}
.preview-stage{width:min(1180px,100%);min-height:760px;display:grid;place-items:center;border:1px solid #d6d6d6;border-radius:22px;background:linear-gradient(145deg,#f4f4f4,#dedede);box-shadow:0 24px 80px rgba(0,0,0,.12)}
.preview-note{position:fixed;right:20px;bottom:16px;color:#686868;font:650 10px/1.2 system-ui,sans-serif}
</style>
</head>
<body>
<div class="preview-stage">
  <div class="maw-panel" role="application" aria-label="Etsy Ads anahtar kelime komut merkezi">
    <header class="maw-header">
      <img src="${logoDataUrl}" width="42" height="42" alt="Makaytron" style="object-fit:contain">
      <div>
        <h1>Etsy Ads Anahtar Kelime Yöneticisi</h1>
        <small>Görünür ilanları tara, eşleşmeleri incele ve kontrollü şekilde uygula.</small>
      </div>
      <div style="display:flex;gap:7px;align-items:center">
        <span class="maw-badge" style="padding:5px 8px;border:1px solid #dedede;background:#fafafa">Hazır</span>
        <button class="maw-btn" aria-label="Paneli kapat">×</button>
      </div>
    </header>
    <main class="maw-body">
      <section class="maw-card">
        <div class="maw-card-header" style="display:flex;align-items:center;justify-content:space-between;gap:12px">
          <div>
            <strong>Çalışma özeti</strong>
            <div style="margin-top:3px;color:#737373;font-size:11px">Mevcut Etsy Ads sayfasındaki görünür veriler</div>
          </div>
          <span class="maw-pill" style="padding:5px 9px;border:1px solid #c9dfd1;background:#edf8f1;color:#1f7a4d">Son tarama: şimdi</span>
        </div>
        <div class="maw-card-body" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px">
          <div style="padding:12px;border:1px solid #dedede;border-radius:11px;background:#fff"><span style="display:block;color:#737373;font-size:10px;font-weight:750;text-transform:uppercase;letter-spacing:.05em">Görünür ilan</span><strong style="display:block;margin-top:5px;font-size:20px">24</strong></div>
          <div style="padding:12px;border:1px solid #dedede;border-radius:11px;background:#fff"><span style="display:block;color:#737373;font-size:10px;font-weight:750;text-transform:uppercase;letter-spacing:.05em">Eşleşen</span><strong style="display:block;margin-top:5px;font-size:20px">8</strong></div>
          <div style="padding:12px;border:1px solid #dedede;border-radius:11px;background:#fff"><span style="display:block;color:#737373;font-size:10px;font-weight:750;text-transform:uppercase;letter-spacing:.05em">Bekleyen işlem</span><strong style="display:block;margin-top:5px;font-size:20px">3</strong></div>
        </div>
      </section>

      <section class="maw-card">
        <div class="maw-card-header">
          <strong>Bu sayfada çalış</strong>
          <div style="margin-top:3px;color:#737373;font-size:11px">Önce tara; sonra yalnız seçtiğin eşleşmeleri değiştir.</div>
        </div>
        <div class="maw-card-body">
          <div class="maw-actions" data-actions>
            <button class="maw-btn primary" data-action="scan-visible">Görünür ilanları tara</button>
            <button class="maw-btn" data-action="enable-selected">Seçilenleri etkinleştir</button>
            <button class="maw-btn" data-action="disable-selected">Seçilenleri devre dışı bırak</button>
          </div>
        </div>
      </section>

      <section class="maw-card">
        <div class="maw-toolbar" data-actions>
          <input type="search" aria-label="Anahtar kelime ara" placeholder="Anahtar kelime veya ilan ara…">
          <select aria-label="Duruma göre filtrele"><option>Tüm durumlar</option><option>Etkin</option><option>Devre dışı</option></select>
          <button class="maw-btn" data-action="clear-filters">Filtreleri temizle</button>
        </div>
        <div style="overflow:auto;max-height:260px">
          <table aria-label="Anahtar kelime eşleşmeleri">
            <thead><tr><th><input type="checkbox" aria-label="Tümünü seç"></th><th>Anahtar kelime</th><th>İlan</th><th>Durum</th><th style="text-align:right">İşlem</th></tr></thead>
            <tbody>
              <tr class="maw-row"><td><input type="checkbox" checked></td><td><strong>custom teacher shirt</strong><div style="color:#737373;font-size:10px">tam eşleşme</div></td><td>Teacher Team Tee</td><td><span class="maw-pill" style="padding:4px 8px;border:1px solid #c9dfd1;background:#edf8f1;color:#1f7a4d">Etkin</span></td><td style="text-align:right"><button class="maw-btn">Kapat</button></td></tr>
              <tr class="maw-row"><td><input type="checkbox" checked></td><td><strong>school spirit tee</strong><div style="color:#737373;font-size:10px">ifade eşleşmesi</div></td><td>School Colors Shirt</td><td><span class="maw-pill" style="padding:4px 8px;border:1px solid #eed69a;background:#fff9df;color:#8a5a00">İncele</span></td><td style="text-align:right"><button class="maw-btn">Kapat</button></td></tr>
              <tr class="maw-row"><td><input type="checkbox"></td><td><strong>personalized mascot</strong><div style="color:#737373;font-size:10px">geniş eşleşme</div></td><td>Custom Mascot Tee</td><td><span class="maw-pill" style="padding:4px 8px;border:1px solid #dedede;background:#fafafa;color:#525252">Kapalı</span></td><td style="text-align:right"><button class="maw-btn">Aç</button></td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="maw-card" style="border-color:#efc3bf!important">
        <div class="maw-card-header">
          <strong style="color:#a32318">Tüm sayfalarda toplu işlem</strong>
          <div style="margin-top:3px;color:#7a332d;font-size:11px">Bu işlem yalnız açık onaydan sonra çalışır ve her sayfayı doğrular.</div>
        </div>
        <div class="maw-card-body">
          <div class="maw-actions" data-actions>
            <button class="maw-btn danger" data-action="disable-all-matches">Tüm sayfalardaki eşleşmeleri devre dışı bırak</button>
            <button class="maw-btn" data-action="open-rule-editor">Anahtar kelime kurallarını düzenle</button>
          </div>
        </div>
      </section>
    </main>
  </div>
</div>
<div class="preview-note">Tamamen sentetik veri · canlı Etsy işlemi yok</div>
<style>${escapeStyleText(css)}</style>
</body>
</html>`;
}

export async function generateAdsCommandCenterPreview() {
  const source = await readFile(SCRIPT_PATH, 'utf8');
  const markerIndex = source.indexOf(MARKER);
  if (markerIndex < 0) throw new Error('Ads command-center marker is missing from production source.');
  const bounds = findTemplateLiteralBounds(source, markerIndex);
  const css = source.slice(bounds.start + 1, bounds.end);
  const logo = await readFile(LOGO_PATH);
  const html = previewDocument(css, `data:image/png;base64,${logo.toString('base64')}`);
  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, html);
  return OUTPUT_PATH;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  generateAdsCommandCenterPreview()
    .then(path => process.stdout.write(`${path}\n`))
    .catch(error => {
      console.error(error.stack || error.message);
      process.exitCode = 1;
    });
}
