// "Your reports" in Settings › Help.
//
// When the user opens a problem report on GitHub, its short id (MK-xxxxx), the
// category and the date are kept in this browser. The Help tab can then look
// the ids up in the public GitHub issues of this repository to show whether a
// report is open or fixed. Only the id is sent, to GitHub's search.

export const ISSUES_SEARCH = 'https://api.github.com/search/issues';
const REPO = 'Makaytron/Etsy-Automation-Tools';
const KEY = 'reports';
const MAX = 20;
const ID_PATTERN = /^MK-[0-9A-F]{5}$/;

/** A new short report id: MK- and five hex digits. */
export function newReportId(random = Math.random) {
  return `MK-${Math.floor(random() * 0xfffff).toString(16).toUpperCase().padStart(5, '0')}`;
}

export function createReports({ gm, store, now = () => Date.now() }) {
  let items = [];

  async function load() {
    const raw = await store.get(KEY, []).catch(() => []);
    items = (Array.isArray(raw) ? raw : []).filter((r) => r && ID_PATTERN.test(r.id) && typeof r.category === 'string' && Number.isFinite(r.at))
      .map((r) => ({ id: r.id, category: r.category.slice(0, 40), at: r.at, state: typeof r.state === 'string' ? r.state.slice(0, 20) : 'sent', fixedIn: typeof r.fixedIn === 'string' ? r.fixedIn.slice(0, 12) : '' }));
    return items;
  }

  async function record({ id, category }) {
    if (!ID_PATTERN.test(id)) return;
    items = [{ id, category, at: now(), state: 'sent', fixedIn: '' }, ...items.filter((r) => r.id !== id)].slice(0, MAX);
    await store.set(KEY, items).catch(() => {});
  }

  function lookup(id) {
    return new Promise((resolve) => {
      if (typeof gm?.xmlHttpRequest !== 'function') { resolve(null); return; }
      const q = encodeURIComponent(`${id} repo:${REPO} in:title type:issue`);
      gm.xmlHttpRequest({
        method: 'GET', url: `${ISSUES_SEARCH}?q=${q}&per_page=1`, anonymous: true, timeout: 15000,
        headers: { Accept: 'application/vnd.github+json' },
        onload: (r) => { try { resolve(r.status === 200 ? JSON.parse(r.responseText).items?.[0] ?? null : null); } catch { resolve(null); } },
        onerror: () => resolve(null), ontimeout: () => resolve(null),
      });
    });
  }

  /** Refreshes the state of each kept report from GitHub (open, fixed or not found). */
  async function refresh() {
    for (const r of items) {
      const issue = await lookup(r.id);
      if (!issue) continue;
      const fixedLabel = (issue.labels ?? []).map((l) => l?.name ?? '').find((n) => /^fixed-in-\d+\.\d+\.\d+$/.test(n));
      r.state = issue.state === 'closed' ? 'fixed' : 'open';
      r.fixedIn = fixedLabel ? fixedLabel.slice('fixed-in-'.length) : '';
    }
    await store.set(KEY, items).catch(() => {});
    return items;
  }

  return { load, record, refresh, list: () => items };
}
