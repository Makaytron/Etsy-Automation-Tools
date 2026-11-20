// Problem reports ("Sorun bildir") go to GitHub.
//
// The report is built by core/diagnostics.js from an allowlist only and is
// shown to the user in full first. The script sends nothing itself: it opens
// a prefilled, public GitHub issue that the user checks and submits there.

export const FEEDBACK_ISSUE_URL = 'https://github.com/Makaytron/Etsy-Automation-Tools/issues/new';

/** A new-issue link on GitHub with the report filled in. */
export function issueUrl(report, id = '') {
  const body = ['```json', JSON.stringify(report, null, 2), '```'].join('\n');
  const url = new URL(FEEDBACK_ISSUE_URL);
  url.searchParams.set('title', `${id ? `${id} ` : ''}[${report.category}] Etsy Automation Tools ${report.appVersion}`);
  url.searchParams.set('body', body);
  return url.href;
}
