import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scriptPath = path.join(repoRoot, 'scripts/etsy-listing-analyzer/Makaytron-Etsy-Listing-Analyzer.user.js');
const outputArgument = process.argv.find((argument) => argument.startsWith('--output='));
const outputDirectory = outputArgument
  ? path.resolve(repoRoot, outputArgument.slice('--output='.length))
  : path.join(repoRoot, 'docs/design/previews');
const outputPath = path.join(outputDirectory, 'listing-analyzer-mkui-preview.html');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function extractStyles(source) {
  const startMarker = '    const STYLES = `';
  const endMarker = '\n    `;\n\n    function logoMarkup';
  const start = source.indexOf(startMarker);
  assert(start >= 0, 'Listing Analyzer STYLES start marker was not found');
  const bodyStart = start + startMarker.length;
  const end = source.indexOf(endMarker, bodyStart);
  assert(end >= 0, 'Listing Analyzer STYLES end marker was not found');
  assert(source.indexOf(startMarker, bodyStart) < 0, 'Listing Analyzer contains more than one STYLES block');
  return source.slice(bodyStart, end);
}

const source = fs.readFileSync(scriptPath, 'utf8');
assert(source.includes('// @version      1.2.3'), 'Preview generation requires Listing Analyzer 1.2.3');
assert(source.includes("const MKUI_VERSION = '1.0.0';"), 'Preview generation requires MKUI 1.0.0');
const styles = extractStyles(source);
assert(styles.includes('/* MKUI v1 canonical Dashboard Shell compatibility layer. */'), 'Preview CSS is not the reviewed MKUI layer');

const icon = (pathData) => `<svg class="meli-svg" viewBox="0 0 24 24" aria-hidden="true">${pathData}</svg>`;
const icons = {
  overview: icon('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>'),
  analysis: icon('<path d="M4 19V9m6 10V5m6 14v-7m4 7H2"/>'),
  ai: icon('<path d="m12 3 1.2 4.2L17 9l-3.8 1.8L12 15l-1.2-4.2L7 9l3.8-1.8L12 3Z"/>'),
  queue: icon('<path d="M8 6h13M8 12h13M8 18h13"/><path d="m3 6 1 1 2-2m-3 7 1 1 2-2m-3 7 1 1 2-2"/>'),
  settings: icon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/>'),
  search: icon('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  filter: icon('<path d="M4 5h16M7 12h10m-7 7h4"/>'),
  spark: icon('<path d="m12 2 1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5L12 2Z"/>'),
};

function listingCard({ code, title, status, score, confidence, visits, favorites, sales, revenue, renewals, lifecycle, tone, selected = false }) {
  const selection = selected ? ' is-selected' : '';
  const checked = selected ? ' checked' : '';
  const insightTone = tone === 'success' ? 'ACTIVE_GROWING' : tone === 'danger' ? 'ACTIVE_DECLINING' : 'LEARNING';
  return `<article class="meli-listing-card${selection}">
    <div class="meli-listing-card-head">
      <label class="meli-card-select" aria-label="Select ${code}"><input class="meli-check" type="checkbox"${checked}></label>
      <div class="meli-card-thumb is-empty" aria-hidden="true"><strong>${code}</strong></div>
      <div class="meli-card-identity"><h3>${title}</h3><div class="meli-card-meta"><span>${status}</span><i></i><span>SKU ${code}-24</span></div><div class="meli-card-status">Captured from verified Etsy metric scopes</div></div>
      <div class="meli-card-health"><div class="meli-score-copy"><span>Evidence readiness</span><strong>${score}/100</strong></div><div class="meli-card-confidence">${confidence}% confidence coverage</div><div class="meli-confidence-track"><i style="width:${confidence}%"></i></div></div>
    </div>
    <div class="meli-metrics-strip">
      <div class="meli-metric"><span>Visits · 30d</span><div><strong>${visits}</strong><small class="${tone === 'success' ? 'up' : tone === 'danger' ? 'down' : ''}">${tone === 'success' ? '+18%' : tone === 'danger' ? '−12%' : 'baseline'}</small></div></div>
      <div class="meli-metric"><span>Favorites · 30d</span><div><strong>${favorites}</strong><small>exact</small></div></div>
      <div class="meli-metric"><span>Sales · all time</span><div><strong>${sales}</strong><small>exact</small></div></div>
      <div class="meli-metric"><span>Revenue · all time</span><div><strong>${revenue}</strong><small>USD</small></div></div>
      <div class="meli-metric"><span>Renewals · all time</span><div><strong>${renewals}</strong><small>exact</small></div></div>
      <div class="meli-metric"><span>Stock</span><div><strong>999</strong><small>available</small></div></div>
    </div>
    <div class="meli-card-insight"><div class="meli-insight-icon" data-lifecycle="${insightTone}">${icons.spark}</div><div><b>${lifecycle}</b><p>${tone === 'success' ? 'Recent reach improved with enough exact evidence for continued observation.' : tone === 'danger' ? 'Traffic is declining; review the saved proposal before any write.' : 'A complete baseline exists; more non-overlapping history is still required.'}</p></div><span>Next review<br>Sep 16, 2026</span></div>
    <div class="meli-listing-card-foot"><button class="meli-card-action" type="button">Details</button><button class="meli-card-action" type="button">Improvement plan</button><button class="meli-card-action primary" type="button">Open listing</button></div>
  </article>`;
}

const panelMarkup = `<section class="meli-panel is-wide" aria-label="Makaytron Etsy Listing Analyzer synthetic preview">
  <header class="meli-head">
    <div class="meli-logo preview-logo" aria-hidden="true">M</div>
    <div class="meli-brand"><h1 class="meli-title">Makaytron Etsy Listing Analyzer</h1><div class="meli-subtitle">MKUI v1 Dashboard Shell · verified local analysis workspace</div></div>
    <span class="meli-version">v1.2.3</span>
    <div class="meli-head-actions"><button class="meli-lang" type="button">EN</button><button class="meli-icon" type="button" aria-label="Compact view">↔</button><button class="meli-icon" type="button" aria-label="Close">×</button></div>
  </header>
  <nav class="meli-nav" aria-label="Listing Analyzer navigation">
    <button class="meli-nav-btn" data-view="overview" type="button">${icons.overview}<span class="meli-nav-label">Overview</span></button>
    <button class="meli-nav-btn is-active" data-view="analysis" data-action="analysis" type="button" aria-current="page">${icons.analysis}<span class="meli-nav-label">Listing analysis</span></button>
    <button class="meli-nav-btn" data-view="ai" data-action="ai" type="button">${icons.ai}<span class="meli-nav-label">AI exchange</span></button>
    <button class="meli-nav-btn" data-view="queue" type="button">${icons.queue}<span class="meli-nav-label">Action queue</span></button>
    <button class="meli-nav-btn" data-view="settings" data-action="settings" type="button">${icons.settings}<span class="meli-nav-label">Settings</span></button>
  </nav>
  <main class="meli-main" data-view-panel="analysis">
    <section class="meli-view">
      <div class="meli-view-head"><div><h2 class="meli-view-title">Listing analysis</h2><p class="meli-view-copy">Fresh, scope-verified evidence from a complete synthetic shop collection.</p></div><span class="meli-pill success">Collection complete</span></div>
      <div class="meli-status" data-tone="ready"><div class="meli-status-mark">✓</div><div><strong>Analysis is ready</strong><span>40 synthetic listings passed metric-scope, identity, pagination, freshness, and manifest checks.</span></div></div>
      <section class="meli-analysis-card">
        <div class="meli-analysis-controls">
          <label class="meli-analysis-search">${icons.search}<input class="meli-input" value="" placeholder="Search title, SKU, issue, or recommendation" aria-label="Search listings"></label>
          <button class="meli-filter-toggle" type="button" aria-expanded="true">${icons.filter}<span>Filters</span><b>2</b></button>
          <label class="meli-sort-control"><span>Sort</span><select class="meli-select"><option>Priority</option></select></label>
          <div class="meli-filter-drawer">
            <label><span>Lifecycle</span><select class="meli-select"><option>All lifecycles · 40</option></select></label>
            <label><span>Recommendation</span><select class="meli-select"><option>Needs review · 8</option></select></label>
            <label><span>Evidence</span><select class="meli-select"><option>Ready · 26</option></select></label>
            <label><span>30-day change</span><select class="meli-select"><option>Any direction · 40</option></select></label>
          </div>
          <div class="meli-selection-tools"><span class="meli-toolbar-meta" data-results-count>40 results · 2 selected</span><button class="meli-text-btn" type="button">Select visible</button><button class="meli-text-btn" type="button">Clear selection</button><span class="meli-shortcut-hint">Ctrl + Alt + A · collect all pages</span></div>
        </div>
        <div class="meli-listing-list" tabindex="0">
          ${listingCard({ code: 'L01', title: 'Personalized Family Trip Shirt · Soft Cotton', status: 'Active', score: 86, confidence: 91, visits: 428, favorites: 37, sales: 64, revenue: '$1,984', renewals: 5, lifecycle: 'Active · growing', tone: 'success', selected: true })}
          ${listingCard({ code: 'L02', title: 'Custom Teacher Name Tee · Classroom Gift', status: 'Active', score: 72, confidence: 84, visits: 215, favorites: 16, sales: 31, revenue: '$947', renewals: 4, lifecycle: 'Active · stable', tone: 'neutral' })}
          ${listingCard({ code: 'L03', title: 'Vintage Team Spirit Sweatshirt · Personalized', status: 'Active', score: 64, confidence: 79, visits: 132, favorites: 8, sales: 19, revenue: '$812', renewals: 3, lifecycle: 'Learning', tone: 'neutral', selected: true })}
          ${listingCard({ code: 'L04', title: 'Minimal Vacation Crew Shirt · Group Matching', status: 'Active', score: 48, confidence: 83, visits: 74, favorites: 3, sales: 11, revenue: '$326', renewals: 6, lifecycle: 'Active · declining', tone: 'danger' })}
        </div>
        <div class="meli-bulk-bar"><div><b>2 listings selected</b><span>Only saved, still-current proposals can enter the action queue.</span></div><div><button class="meli-btn" data-action="export" type="button">Export AI request</button><button class="meli-btn primary" type="button">Create review queue</button></div></div>
      </section>
    </section>
  </main>
</section>`;

const previewCss = `
  :host{display:block}
  .preview-logo{border:1px solid var(--meli-border);border-radius:var(--meli-radius-sm);background:var(--meli-primary);color:var(--meli-primary-fg);font:800 19px/1 Inter,system-ui,sans-serif}
  .meli-panel{top:14px;right:14px;bottom:14px}
  .meli-listing-list{grid-template-columns:repeat(2,minmax(420px,1fr))!important}
  .meli-card-thumb strong{font-size:13px;letter-spacing:.04em}
  .meli-filter-drawer{display:grid!important}
  *{animation:none!important;transition:none!important}
`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Listing Analyzer MKUI v1.2.3 Preview</title>
<style>
  html,body{width:100%;height:100%;margin:0;overflow:hidden;background:#e8e8e8}
  body:before{content:"NETWORK-ISOLATED SYNTHETIC PREVIEW";position:fixed;left:24px;bottom:24px;color:#737373;font:700 10px/1.2 system-ui,sans-serif;letter-spacing:.08em}
</style>
</head>
<body>
<div id="preview-root"></div>
<script>
  const host = document.getElementById('preview-root');
  const shadow = host.attachShadow({mode:'open'});
  const style = document.createElement('style');
  style.textContent = ${JSON.stringify(`${styles}\n${previewCss}`)};
  const root = document.createElement('div');
  root.innerHTML = ${JSON.stringify(panelMarkup)};
  shadow.append(style, root);
  document.documentElement.dataset.previewReady = 'true';
  window.__LISTING_ANALYZER_PREVIEW_READY__ = true;
</script>
</body>
</html>\n`;

assert(!/<script\s+[^>]*src=/i.test(html), 'Preview must not load external scripts');
assert(!/<link\s+[^>]*href=/i.test(html), 'Preview must not load external styles');
assert(!/etsy\.com\/your\/shops\//i.test(html), 'Preview must not contain an Etsy account route');
assert(!/sjwibgcflufmzaorlwqe/i.test(html), 'Preview must not contain the telemetry endpoint');

fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(outputPath, html, 'utf8');
console.log(`Generated ${outputPath}`);
