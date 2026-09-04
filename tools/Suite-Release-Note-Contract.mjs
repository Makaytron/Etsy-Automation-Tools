function fail(message) {
  throw new Error(message);
}

function sectionBody(source, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`(?:^|\\n)## ${escaped}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`));
  if (!match) fail(`Suite release note is missing section: ## ${heading}`);
  return match[1].trim();
}

export function validateSuiteReleaseNote({ source, version, packages }) {
  if (typeof source !== 'string' || !source.trim()) fail('Suite release note source is empty.');
  if (!/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(version ?? '')) fail(`Invalid suite version: ${version ?? 'missing'}`);
  if (!Array.isArray(packages) || packages.length === 0) fail('Suite package contract is empty.');

  const title = `# Etsy Automation Tools bundle v${version}`;
  const titleMatches = source.split(/\r?\n/).filter((line) => line === title);
  if (titleMatches.length !== 1) fail(`Suite release note must contain exactly one title: ${title}`);

  const packageSection = sectionBody(source.replace(/\r\n?/g, '\n'), 'Package versions');
  const packageRows = packageSection.split('\n').filter((line) => line.trim()).map((line) => {
    const match = line.match(/^- (.+?): `((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))`$/);
    if (!match) fail(`Invalid package-version row: ${line}`);
    return { publicName: match[1], version: match[2] };
  });
  if (packageRows.length !== packages.length) fail(`Package versions section must contain exactly ${packages.length} rows; found ${packageRows.length}.`);

  const seenNames = new Set();
  for (const row of packageRows) {
    if (seenNames.has(row.publicName)) fail(`Duplicate package-version row: ${row.publicName}`);
    seenNames.add(row.publicName);
  }
  for (const expected of packages) {
    const matches = packageRows.filter((row) => row.publicName === expected.publicName);
    if (matches.length !== 1) fail(`Package versions section must contain ${expected.publicName} exactly once.`);
    if (matches[0].version !== expected.version) fail(`${expected.publicName} release-note version ${matches[0].version} does not match userscript version ${expected.version}.`);
  }
  for (const row of packageRows) {
    if (!packages.some((expected) => expected.publicName === row.publicName)) fail(`Unexpected package in release note: ${row.publicName}`);
  }

  const scriptSection = sectionBody(source.replace(/\r\n?/g, '\n'), 'Installable scripts');
  const scriptRows = scriptSection.split('\n').filter((line) => line.trim()).map((line) => {
    const match = line.match(/^- `([^`/]+\.user\.js)`$/);
    if (!match) fail(`Invalid installable-script row: ${line}`);
    return match[1];
  });
  if (scriptRows.length !== packages.length) fail(`Installable scripts section must contain exactly ${packages.length} rows; found ${scriptRows.length}.`);
  if (new Set(scriptRows).size !== scriptRows.length) fail('Installable scripts section contains duplicate filenames.');

  const expectedScripts = packages.map((entry) => entry.scriptName).sort();
  const actualScripts = [...scriptRows].sort();
  if (JSON.stringify(actualScripts) !== JSON.stringify(expectedScripts)) {
    fail(`Installable scripts do not match the production registry. Expected ${expectedScripts.join(', ')}; got ${actualScripts.join(', ')}.`);
  }

  const signedTagReference = `signed \`v${version}\` tag`;
  if (!source.includes(signedTagReference)) fail(`Suite release note must identify its immutable source as the ${signedTagReference}.`);

  return { packageCount: packages.length, scriptCount: scriptRows.length };
}
