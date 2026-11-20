// Version check for Settings › Updates.
//
// Tampermonkey installs updates itself from the @updateURL; this only tells
// the user whether a newer version exists. The stable channel reads the
// @version line of the script on GitHub `main`; the beta channel reads the
// newest pre-release of the unified package on GitHub. A check runs when the
// user asks, or at most once a day while the Updates tab is open. Only GitHub
// is contacted, without cookies, and nothing about the user is sent.

export const STABLE_URL = 'https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/main/scripts/etsy-automation-tools/Makaytron-Etsy-Automation-Tools.user.js';
export const RELEASES_API = 'https://api.github.com/repos/Makaytron/Etsy-Automation-Tools/releases?per_page=30';
export const RELEASES_PAGE = 'https://github.com/Makaytron/Etsy-Automation-Tools/releases';
const DAY = 24 * 60 * 60 * 1000;
const KEY = 'update.check';

/** -1, 0 or 1 for strict x.y.z versions; null when either is not one. */
export function compareVersions(a, b) {
  const pa = /^\d+\.\d+\.\d+$/.test(a ?? '') ? a.split('.').map(Number) : null;
  const pb = /^\d+\.\d+\.\d+$/.test(b ?? '') ? b.split('.').map(Number) : null;
  if (!pa || !pb) return null;
  for (let i = 0; i < 3; i += 1) if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  return 0;
}

function request(gm, url, headers = {}) {
  return new Promise((resolve, reject) => {
    if (typeof gm?.xmlHttpRequest !== 'function') { reject(new Error('no_request')); return; }
    gm.xmlHttpRequest({
      method: 'GET', url, anonymous: true, timeout: 15000, headers,
      onload: (r) => (r.status >= 200 && r.status < 300 ? resolve(r.responseText) : reject(new Error(`http_${r.status}`))),
      onerror: () => reject(new Error('network')), ontimeout: () => reject(new Error('timeout')),
    });
  });
}

export function createUpdates({ gm, store, appVersion, settings, now = () => Date.now() }) {
  const listeners = new Set();
  let state = { checkedAt: 0, latest: null, url: null, error: '', checking: false };
  const emit = () => { for (const fn of listeners) fn(state); };

  async function load() {
    const saved = await store.get(KEY, null).catch(() => null);
    if (saved && typeof saved === 'object') state = { ...state, checkedAt: Number(saved.checkedAt) || 0, latest: typeof saved.latest === 'string' ? saved.latest : null, url: typeof saved.url === 'string' ? saved.url : null };
    return state;
  }

  async function check() {
    if (state.checking) return state;
    state = { ...state, checking: true, error: '' };
    emit();
    try {
      let latest = null; let url = null;
      if (settings.get().updates.channel === 'beta') {
        const releases = JSON.parse(await request(gm, RELEASES_API, { Accept: 'application/vnd.github+json' }));
        const release = (Array.isArray(releases) ? releases : []).find((r) => /^etsy-automation-tools-v\d+\.\d+\.\d+/.test(r?.tag_name ?? ''));
        latest = release ? release.tag_name.replace(/^etsy-automation-tools-v/, '').replace(/[^0-9.].*$/, '') : null;
        url = release?.html_url ?? RELEASES_PAGE;
      } else {
        const head = (await request(gm, STABLE_URL)).slice(0, 4000);
        latest = head.match(/^\/\/\s*@version\s+(\d+\.\d+\.\d+)\s*$/m)?.[1] ?? null;
        url = STABLE_URL;
      }
      state = { checkedAt: now(), latest, url, error: latest ? '' : 'no_version', checking: false };
    } catch (error) {
      state = { ...state, checkedAt: now(), error: error?.message ?? 'network', checking: false };
    }
    await store.set(KEY, { checkedAt: state.checkedAt, latest: state.latest, url: state.url }).catch(() => {});
    emit();
    return state;
  }

  return {
    load,
    check,
    /** Checks if the last check is older than a day. */
    checkIfStale: () => (now() - state.checkedAt > DAY ? check() : Promise.resolve(state)),
    state: () => state,
    available: () => compareVersions(appVersion, state.latest) === -1,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
