import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const REPOSITORY_ROOT = resolve(import.meta.dirname, '..');
export const DESIGN_SOURCE_REGISTRY_PATH = resolve(
  REPOSITORY_ROOT,
  'docs/design/DESIGN-SOURCE-REGISTRY.json',
);

const SOURCE_ID_PATTERN = /^(?:template|toast|shadcn)\.[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const BLOB_SHA_PATTERN = /^[0-9a-f]{40}$/;
const ALLOWED_CATEGORIES = new Set([
  'template',
  'toast',
  'shadcn-dashboard',
  'shadcn-block',
]);
const REQUIRED_SOURCE_IDS = Object.freeze([
  'template.shell.base-layout',
  'template.shell.app-sidebar',
  'template.shell.site-header',
  'template.theme.tokens',
  'template.primitive.button',
  'template.primitive.card',
  'toast.container',
  'toast.item',
  'toast.styles',
  'shadcn.dashboard.applied',
  'shadcn.blocks.application-shell',
  'shadcn.blocks.application-interface',
  'shadcn.blocks.datatable',
  'shadcn.blocks.kpi-widgets',
]);

function parseRegistry() {
  return JSON.parse(readFileSync(DESIGN_SOURCE_REGISTRY_PATH, 'utf8'));
}

export function validateDesignSourceRegistry(registry) {
  const errors = [];
  if (!registry || typeof registry !== 'object') {
    return ['Registry must be a JSON object.'];
  }
  if (registry.schemaVersion !== 1) errors.push('schemaVersion must be 1.');
  if (registry.status !== 'normative') errors.push('status must be normative.');
  if (registry.policyDocument !== 'docs/design/DESIGN-SOURCE-LOCK.md') {
    errors.push('policyDocument must point to docs/design/DESIGN-SOURCE-LOCK.md.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(registry.verifiedAt || '')) {
    errors.push('verifiedAt must use YYYY-MM-DD.');
  }

  const requiredRules = [
    'uiChangesRequireRegisteredSourceIds',
    'everyUiChangeRequiresTemplateSource',
    'everyUiChangeRequiresAppliedDashboardSource',
    'everyUiChangeRequiresNamedShadcnBlockSource',
    'toastChangesRequireToast01Sources',
    'repositorySourcesRequireExactPath',
    'shadcnBlocksRequireExactUrlFamilyNameAndNumber',
    'unregisteredSourcesAllowed',
    'remoteRuntimeDependenciesAllowed',
    'newSourceIdsRequireMaintainerApproval',
  ];
  for (const rule of requiredRules) {
    if (!(rule in (registry.rules || {}))) errors.push(`Missing registry rule: ${rule}.`);
  }
  const mustBeTrue = requiredRules.filter(rule => ![
    'unregisteredSourcesAllowed',
    'remoteRuntimeDependenciesAllowed',
  ].includes(rule));
  for (const rule of mustBeTrue) {
    if (registry.rules?.[rule] !== true) errors.push(`${rule} must be true.`);
  }
  for (const rule of ['unregisteredSourcesAllowed', 'remoteRuntimeDependenciesAllowed']) {
    if (registry.rules?.[rule] !== false) errors.push(`${rule} must be false.`);
  }

  if (!Array.isArray(registry.sources) || registry.sources.length < 20) {
    errors.push('sources must contain the approved source catalog.');
    return errors;
  }

  const ids = new Set();
  for (const source of registry.sources) {
    const label = source?.id || '<missing-id>';
    if (!SOURCE_ID_PATTERN.test(label)) errors.push(`Invalid source id: ${label}.`);
    if (ids.has(label)) errors.push(`Duplicate source id: ${label}.`);
    ids.add(label);
    if (!ALLOWED_CATEGORIES.has(source.category)) {
      errors.push(`${label} has an unsupported category: ${source.category}.`);
    }
    if (!Array.isArray(source.roles) || source.roles.length === 0) {
      errors.push(`${label} must declare at least one role.`);
    }

    if (source.kind === 'repository-file') {
      if (!['Makaytron/Tamplate-Back-White-01', 'Makaytron/Toast-01'].includes(source.repository)) {
        errors.push(`${label} uses an unapproved repository.`);
      }
      if (source.ref !== 'main') errors.push(`${label} must currently use ref main.`);
      if (!source.path || source.path.startsWith('/') || source.path.includes('..')) {
        errors.push(`${label} must provide a safe exact repository path.`);
      }
      if (!BLOB_SHA_PATTERN.test(source.verifiedBlobSha || '')) {
        errors.push(`${label} must provide a verified 40-character blob SHA.`);
      }
    } else if (source.kind === 'reference-page' || source.kind === 'block-family') {
      let url;
      try {
        url = new URL(source.url);
      } catch {
        errors.push(`${label} must provide a valid URL.`);
        continue;
      }
      if (url.protocol !== 'https:' || url.hostname !== 'shadcnstore.com') {
        errors.push(`${label} must use an HTTPS shadcnstore.com URL.`);
      }
      if (source.kind === 'reference-page' && label !== 'shadcn.dashboard.applied') {
        errors.push(`${label} is not an approved applied-dashboard source id.`);
      }
      if (source.kind === 'block-family') {
        if (!url.pathname.startsWith('/blocks/')) {
          errors.push(`${label} block-family URL must live under /blocks/.`);
        }
        if (!source.family || source.family.length < 4) {
          errors.push(`${label} must name its ShadcnStore block family.`);
        }
        if (source.requiresVariantNameAndNumber !== true) {
          errors.push(`${label} must require a variant name and number.`);
        }
      }
    } else {
      errors.push(`${label} has an unsupported kind: ${source.kind}.`);
    }
  }

  for (const id of REQUIRED_SOURCE_IDS) {
    if (!ids.has(id)) errors.push(`Missing mandatory source id: ${id}.`);
  }

  return errors;
}

export const DESIGN_SOURCE_REGISTRY = Object.freeze(parseRegistry());
const registryErrors = validateDesignSourceRegistry(DESIGN_SOURCE_REGISTRY);
if (registryErrors.length) {
  throw new Error(`Invalid design source registry:\n- ${registryErrors.join('\n- ')}`);
}

export const DESIGN_SOURCES_BY_ID = Object.freeze(new Map(
  DESIGN_SOURCE_REGISTRY.sources.map(source => [source.id, Object.freeze(source)]),
));

export function sourceById(id) {
  return DESIGN_SOURCES_BY_ID.get(id) || null;
}

export function sourceIdsByCategory(category) {
  return DESIGN_SOURCE_REGISTRY.sources
    .filter(source => source.category === category)
    .map(source => source.id);
}

export function extractRegisteredSourceIds(value) {
  const candidates = String(value || '')
    .split(/[\s,;]+/)
    .map(token => token.replace(/^[`'"([{]+|[`'"\])}.:]+$/g, ''))
    .filter(token => SOURCE_ID_PATTERN.test(token));
  return [...new Set(candidates)];
}

export function exactSourceLocator(source) {
  if (!source) return '';
  if (source.kind === 'repository-file') {
    return `${source.repository}@${source.ref}:${source.path}`;
  }
  return source.url || '';
}
