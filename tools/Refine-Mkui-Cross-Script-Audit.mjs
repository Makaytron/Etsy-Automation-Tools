import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'tools/Audit-Mkui-Cross-Script-Coexistence.mjs');
let source = fs.readFileSync(target, 'utf8');

function replaceOnce(from, to, label) {
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`Missing refinement anchor: ${label}`);
  if (source.indexOf(from, first + from.length) >= 0) throw new Error(`Ambiguous refinement anchor: ${label}`);
  source = source.slice(0, first) + to + source.slice(first + from.length);
}

replaceOnce(
  "];\n\nfunction sha256(value) {",
  `];

const CANONICAL_ROUTES = [
  { owner: 'ads-keyword-manager', url: 'https://www.etsy.com/your/shops/me/advertising/listings/1234567890' },
  { owner: 'keyword-market-analyzer', url: 'https://www.etsy.com/your/shops/example-shop/marketplace-insights?ref=dashboard' },
  { owner: 'sale-manager', url: 'https://www.etsy.com/your/shops/me/sales-discounts?ref=seller-platform' },
  { owner: 'sale-manager', url: 'https://etsy.com/your/shops/me/sales-discounts' },
  { owner: 'message-assistant', url: 'https://www.etsy.com/messages' },
  { owner: 'message-assistant', url: 'https://www.etsy.com/messages/123456789' },
  { owner: 'message-assistant', url: 'https://www.etsy.com/conversations/123456789' },
  { owner: 'message-assistant', url: 'https://www.etsy.com/your/orders/sold?ref=seller-platform' },
  { owner: 'message-assistant', url: 'https://www.etsy.com/your/shops/example-shop/dashboard' },
  { owner: 'listing-analyzer', url: 'https://www.etsy.com/your/shops/example-shop/tools/listings?ref=seller-platform' },
  { owner: 'listing-analyzer', url: 'https://www.etsy.com/your/shops/example-shop/listing-editor/edit/1234567890' },
];

function sha256(value) {`,
  'canonical route fixtures',
);

replaceOnce(
  "...matches(source, /\\bwindow\\.([A-Za-z_$][\\w$]*)\\s*=/g, 1),\n    ...matches(source, /\\bwindow\\[['\"]([^'\"]+)['\"]\\]\\s*=/g, 1),\n    ...matches(source, /\\bglobalThis\\.([A-Za-z_$][\\w$]*)\\s*=/g, 1),",
  "...matches(source, /\\bwindow\\.([A-Za-z_$][\\w$]*)\\s*=(?!=)/g, 1),\n    ...matches(source, /\\bwindow\\[['\"]([^'\"]+)['\"]\\]\\s*=(?!=)/g, 1),\n    ...matches(source, /\\bglobalThis\\.([A-Za-z_$][\\w$]*)\\s*=(?!=)/g, 1),",
  'assignment-only global extraction',
);

replaceOnce(
  `const routeOverlap = [];
for (let left = 0; left < scripts.length; left += 1) {
  for (let right = left + 1; right < scripts.length; right += 1) {
    const overlaps = [];
    for (const leftPattern of scripts[left].matches) {
      for (const rightPattern of scripts[right].matches) {
        if (patternsOverlap(leftPattern, rightPattern)) overlaps.push({ leftPattern, rightPattern });
      }
    }
    routeOverlap.push({ left: scripts[left].id, right: scripts[right].id, overlaps });
  }
}
`,
  `const routeGlobOverlap = [];
for (let left = 0; left < scripts.length; left += 1) {
  for (let right = left + 1; right < scripts.length; right += 1) {
    const overlaps = [];
    for (const leftPattern of scripts[left].matches) {
      for (const rightPattern of scripts[right].matches) {
        if (patternsOverlap(leftPattern, rightPattern)) overlaps.push({ leftPattern, rightPattern });
      }
    }
    routeGlobOverlap.push({ left: scripts[left].id, right: scripts[right].id, overlaps });
  }
}

const routeOwnership = CANONICAL_ROUTES.map((fixture) => ({
  ...fixture,
  matchedScripts: scripts
    .filter((script) => script.matches.some((pattern) => wildcardToRegex(pattern).test(fixture.url)))
    .map((script) => script.id),
}));
`,
  'route ownership matrix',
);

replaceOnce(
  "  routeMatchesArePairwiseExclusive: routeOverlap.every((pair) => pair.overlaps.length === 0),\n  noWindowGlobalCollisions: windowGlobalCollisions.length === 0,",
  "  canonicalRoutesHaveSingleOwner: routeOwnership.every((fixture) => fixture.matchedScripts.length === 1 && fixture.matchedScripts[0] === fixture.owner),\n  noWindowGlobalCollisions: windowGlobalCollisions.length === 0,",
  'route assertion',
);

replaceOnce(
  "    routeOverlap,\n    domIdCollisions,",
  "    routeGlobOverlap,\n    routeOwnership,\n    domIdCollisions,",
  'route matrices',
);

fs.writeFileSync(target, source, 'utf8');
console.log('Refined cross-script route ownership and global assignment detection.');
