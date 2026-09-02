import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';

const ROOT = resolve(import.meta.dirname, '..');
const SCRIPT_PATH = resolve(
  ROOT,
  'scripts/etsy-ads-keyword-manager/Makaytron-Etsy-Ads-Keyword-Manager.user.js',
);

export const MARKER = '/* MKUI Ads Command Center v1 — registered-source adaptation. */';
const MKUI_ANCHOR = '--maw-radius-lg:14px';

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
  if (start < 0) throw new Error('Unable to locate the MKUI CSS template start.');

  for (let index = offset; index < source.length; index += 1) {
    if (source[index] !== '`') continue;
    let slashCount = 0;
    for (let cursor = index - 1; cursor > start && source[cursor] === '\\'; cursor -= 1) {
      slashCount += 1;
    }
    if (slashCount % 2 === 0) return { start, end: index };
  }
  throw new Error('Unable to locate the MKUI CSS template end.');
}

function existingClassSelectors(source, candidates) {
  const classes = new Set(source.match(/\bmaw-[a-z0-9_-]+\b/gi) || []);
  return candidates
    .filter(candidate => classes.has(candidate))
    .map(candidate => `.${candidate}`)
    .join(',');
}

function selectorsOrFallback(source, candidates, fallback) {
  return existingClassSelectors(source, candidates) || fallback;
}

export function commandCenterCss(source) {
  const header = selectorsOrFallback(
    source,
    ['maw-header', 'maw-panel-header', 'maw-head'],
    '.maw-panel > header',
  );
  const body = selectorsOrFallback(
    source,
    ['maw-body', 'maw-panel-body', 'maw-content', 'maw-main'],
    '.maw-panel > main',
  );
  const actionRows = selectorsOrFallback(
    source,
    ['maw-actions', 'maw-action-row', 'maw-toolbar', 'maw-controls', 'maw-filter-row'],
    '.maw-panel [data-actions]',
  );
  const cards = selectorsOrFallback(
    source,
    ['maw-card', 'maw-section', 'maw-summary', 'maw-status-card', 'maw-rule-card'],
    '.maw-panel section',
  );
  const rows = selectorsOrFallback(
    source,
    ['maw-row', 'maw-rule-row', 'maw-list-row', 'maw-keyword-row'],
    '.maw-panel tbody tr',
  );
  const buttonClasses = selectorsOrFallback(
    source,
    ['maw-btn', 'maw-button', 'maw-action'],
    '.maw-panel button',
  );

  return `

${MARKER}
/*
 * Registered design sources:
 * - template.shell.base-layout
 * - template.shell.site-header
 * - template.theme.tokens
 * - template.primitive.card
 * - template.primitive.button
 * - template.primitive.input
 * - template.primitive.table
 * - shadcn.dashboard.applied
 * - shadcn.blocks.application-interface — Application Interface 2
 * - shadcn.blocks.datatable — Data Table 2
 * Toast mapping: N/A — this pass does not add or change transient feedback.
 */
.maw-panel{
  width:min(680px,calc(100vw - 24px))!important;
  max-width:calc(100vw - 24px)!important;
  min-width:min(520px,calc(100vw - 24px));
  border-radius:18px!important;
  border-color:color-mix(in srgb,var(--maw-border,#dedede) 88%,#000 12%)!important;
  background:var(--maw-bg,#f7f7f7)!important;
  box-shadow:0 1px 2px rgba(0,0,0,.05),0 24px 64px rgba(0,0,0,.18)!important;
  overflow:hidden!important;
  container-type:inline-size;
}
${header}{
  position:sticky;
  top:0;
  z-index:8;
  min-height:68px!important;
  padding:12px 14px!important;
  display:grid!important;
  grid-template-columns:auto minmax(0,1fr) auto;
  align-items:center!important;
  gap:12px!important;
  border-bottom:1px solid var(--maw-border,#dedede)!important;
  background:color-mix(in srgb,var(--maw-surface,#fff) 94%,transparent)!important;
  backdrop-filter:blur(14px);
}
${header} h1,${header} h2,${header} [class*="title"]{
  overflow:hidden;
  margin:0!important;
  color:var(--maw-fg,#171717)!important;
  font-size:15px!important;
  font-weight:760!important;
  line-height:1.25!important;
  letter-spacing:-.02em!important;
  text-overflow:ellipsis;
  white-space:nowrap;
}
${header} [class*="subtitle"],${header} small{
  display:block;
  margin-top:3px;
  color:var(--maw-muted-fg,#666)!important;
  font-size:11px!important;
  line-height:1.35!important;
  white-space:normal!important;
}
${body}{
  padding:16px!important;
  background:var(--maw-bg,#f7f7f7)!important;
  scrollbar-gutter:stable;
}
${body}>*:first-child{margin-top:0!important}
${cards}{
  border:1px solid var(--maw-border,#dedede)!important;
  border-radius:14px!important;
  background:var(--maw-surface,#fff)!important;
  box-shadow:0 1px 2px rgba(0,0,0,.04)!important;
}
${cards}+${cards}{margin-top:12px!important}
${cards} [class*="header"],${cards} [class*="head"]{
  min-height:46px;
  padding:11px 13px!important;
  border-bottom-color:var(--maw-border,#dedede)!important;
  background:#fafafa!important;
}
${cards} [class*="body"],${cards} [class*="content"]{padding:13px!important}
${actionRows}{
  display:grid!important;
  grid-template-columns:repeat(2,minmax(0,1fr));
  align-items:stretch!important;
  gap:8px!important;
}
${actionRows}>*{min-width:0!important}
${buttonClasses},.maw-panel button{
  min-width:0;
  min-height:38px!important;
  height:auto!important;
  padding:9px 12px!important;
  border-radius:9px!important;
  font-size:12px!important;
  font-weight:680!important;
  line-height:1.25!important;
  text-align:center;
  white-space:normal!important;
  overflow-wrap:anywhere;
  transition:background-color .14s ease,border-color .14s ease,color .14s ease,box-shadow .14s ease,transform .14s ease!important;
}
.maw-panel button:hover:not(:disabled){transform:translateY(-1px)}
.maw-panel button:focus-visible,
.maw-panel input:focus-visible,
.maw-panel select:focus-visible,
.maw-panel textarea:focus-visible{
  outline:0!important;
  box-shadow:0 0 0 3px rgba(23,23,23,.14)!important;
}
.maw-panel button[class*="primary"],
.maw-panel [data-variant="primary"],
.maw-panel [data-action*="scan"],
.maw-panel [data-action*="refresh"]{
  border-color:var(--maw-primary,#1f1f1f)!important;
  background:var(--maw-primary,#1f1f1f)!important;
  color:var(--maw-primary-fg,#fafafa)!important;
  box-shadow:0 1px 2px rgba(0,0,0,.12)!important;
}
.maw-panel button[class*="danger"],
.maw-panel [data-variant="danger"],
.maw-panel [data-action*="disable-all"],
.maw-panel [data-action*="remove-all"],
.maw-panel [data-action*="bulk-disable"]{
  border-color:#efc3bf!important;
  background:#fff7f6!important;
  color:#a32318!important;
  box-shadow:none!important;
}
.maw-panel button:disabled{opacity:.48!important;transform:none!important;cursor:not-allowed!important}
.maw-panel input:not([type="checkbox"]):not([type="radio"]),
.maw-panel select,
.maw-panel textarea{
  min-height:38px!important;
  border-radius:9px!important;
  border-color:var(--maw-input,#cfcfcf)!important;
  background:var(--maw-surface,#fff)!important;
  color:var(--maw-fg,#171717)!important;
}
.maw-panel table{width:100%;border-collapse:separate!important;border-spacing:0!important}
.maw-panel thead th{
  position:sticky;
  top:0;
  z-index:2;
  padding:10px 11px!important;
  border-bottom:1px solid var(--maw-border,#dedede)!important;
  background:#fafafa!important;
  color:var(--maw-muted-fg,#666)!important;
  font-size:10px!important;
  font-weight:760!important;
  letter-spacing:.055em!important;
  text-transform:uppercase;
}
${rows},.maw-panel tbody tr{background:var(--maw-surface,#fff)!important}
${rows}:hover,.maw-panel tbody tr:hover{background:#fafafa!important}
.maw-panel tbody td{padding:11px!important;border-bottom-color:var(--maw-border,#e5e5e5)!important;vertical-align:middle!important}
.maw-panel [class*="badge"],.maw-panel [class*="pill"],.maw-panel [class*="status"]{
  border-radius:999px!important;
  font-weight:720!important;
}
.maw-panel [class*="empty"]{
  min-height:148px!important;
  padding:28px 20px!important;
  border:1px dashed var(--maw-border,#d7d7d7)!important;
  border-radius:12px!important;
  background:#fafafa!important;
  text-align:center!important;
}
@container (min-width:600px){
  ${actionRows}{grid-template-columns:repeat(3,minmax(0,1fr))}
  ${actionRows}>:first-child{grid-column:span 2}
}
@media(max-width:720px){
  .maw-panel{
    inset:8px!important;
    width:auto!important;
    max-width:none!important;
    min-width:0!important;
    max-height:calc(100dvh - 16px)!important;
    border-radius:15px!important;
  }
  ${header}{grid-template-columns:auto minmax(0,1fr) auto;padding:10px 11px!important}
  ${body}{padding:11px!important}
  ${actionRows}{grid-template-columns:1fr!important}
  ${actionRows}>:first-child{grid-column:auto!important}
  .maw-panel button{width:100%}
}
@media(max-width:420px){
  ${header}{grid-template-columns:minmax(0,1fr) auto}
  ${header}>:first-child{display:none!important}
  .maw-panel tbody td{padding:9px 8px!important}
}
@media(prefers-reduced-motion:reduce){
  .maw-panel,.maw-panel *{scroll-behavior:auto!important;transition-duration:.01ms!important;animation-duration:.01ms!important;animation-iteration-count:1!important}
  .maw-panel button:hover:not(:disabled){transform:none!important}
}
`;
}

export function applyAdsCommandCenter(source) {
  if (source.includes(MARKER)) return source;
  const anchorIndex = source.indexOf(MKUI_ANCHOR);
  if (anchorIndex < 0) {
    throw new Error(`Expected one MKUI CSS anchor: ${MKUI_ANCHOR}`);
  }
  if (source.indexOf(MKUI_ANCHOR, anchorIndex + 1) >= 0) {
    throw new Error(`Expected one MKUI CSS anchor, found multiple: ${MKUI_ANCHOR}`);
  }
  const bounds = findTemplateLiteralBounds(source, anchorIndex);
  const css = commandCenterCss(source);
  return `${source.slice(0, bounds.end)}${css}${source.slice(bounds.end)}`;
}

async function main() {
  const write = process.argv.includes('--write');
  const source = await readFile(SCRIPT_PATH, 'utf8');
  const output = applyAdsCommandCenter(source);
  if (output === source) {
    process.stdout.write('Ads command center is already applied.\n');
    return;
  }
  if (!write) {
    process.stdout.write('Ads command center update is required. Run with --write.\n');
    process.exitCode = 2;
    return;
  }
  await writeFile(SCRIPT_PATH, output);
  process.stdout.write('Ads command center CSS applied.\n');
}

const invoked = process.argv[1] ? resolve(process.argv[1]) : '';
if (invoked === resolve(new URL(import.meta.url).pathname)) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
