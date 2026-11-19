// Sending a problem report ("Sorun bildir").
//
// The report is built by core/diagnostics.js from an allowlist only and is
// shown to the user in full before anything is sent. It goes to Makaytron's
// feedback endpoint only when the user presses Send; nothing is sent in the
// background and nothing is retried on its own.

export const FEEDBACK_ENDPOINT = 'https://sjwibgcflufmzaorlwqe.supabase.co/functions/v1/feedback-ingest';
export const FEEDBACK_FALLBACK_URL = 'https://github.com/Makaytron/Etsy-Automation-Tools/issues/new';

/** Posts one report. Resolves true when the endpoint accepted it. */
export function sendReport(gm, report, { timeoutMs = 15000 } = {}) {
  return new Promise((resolve) => {
    if (typeof gm?.xmlHttpRequest !== 'function') { resolve(false); return; }
    try {
      gm.xmlHttpRequest({
        method: 'POST',
        url: FEEDBACK_ENDPOINT,
        timeout: timeoutMs,
        anonymous: true,
        headers: { 'Content-Type': 'application/json', 'x-makaytron-feedback': '1' },
        data: JSON.stringify(report),
        onload: (response) => resolve(response?.status >= 200 && response?.status < 300),
        onerror: () => resolve(false),
        ontimeout: () => resolve(false),
      });
    } catch {
      resolve(false);
    }
  });
}

/** A GitHub issue link with the same report, for when sending fails. */
export function fallbackIssueUrl(report) {
  const body = ['```json', JSON.stringify(report, null, 2), '```'].join('\n');
  const url = new URL(FEEDBACK_FALLBACK_URL);
  url.searchParams.set('title', `[${report.category}] Etsy Automation Tools ${report.appVersion}`);
  url.searchParams.set('body', body);
  return url.href;
}
