$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$utf8 = [System.Text.UTF8Encoding]::new($false)

function Read-RepoText([string]$relativePath) {
    return [System.IO.File]::ReadAllText((Join-Path $repoRoot $relativePath), [System.Text.Encoding]::UTF8)
}

function Write-RepoText([string]$relativePath, [string]$content) {
    [System.IO.File]::WriteAllText((Join-Path $repoRoot $relativePath), $content, $utf8)
}

$scriptPath = 'scripts/etsy-message-assistant/Makaytron-Etsy-Message-Assistant.user.js'
$script = Read-RepoText $scriptPath
$script = $script.Replace('// @version      1.2.6', '// @version      1.2.7')
$script = $script.Replace("const APP_VERSION = '1.2.6';", "const APP_VERSION = '1.2.7';")
if ($script -notmatch '(?m)^// @version\s+1\.2\.7\s*$') { throw 'Missing userscript @version 1.2.7.' }
if ($script -notmatch "(?m)^\s*const APP_VERSION = '1\.2\.7';\s*$") { throw 'Missing APP_VERSION 1.2.7.' }
Write-RepoText $scriptPath $script

$readmeEnPath = 'scripts/etsy-message-assistant/README.en.md'
$readmeEn = (Read-RepoText $readmeEnPath).Replace('Version: `1.2.6`', 'Version: `1.2.7`')
if ($readmeEn -notmatch 'Version: `1\.2\.7`') { throw 'English README version was not updated.' }
Write-RepoText $readmeEnPath $readmeEn

$readmeTrPath = 'scripts/etsy-message-assistant/README.md'
$readmeTr = (Read-RepoText $readmeTrPath).Replace('**Sürüm:** 1.2.6', '**Sürüm:** 1.2.7')
if ($readmeTr -notmatch '\*\*Sürüm:\*\* 1\.2\.7') { throw 'Turkish README version was not updated.' }
Write-RepoText $readmeTrPath $readmeTr

foreach ($rootReadmePath in @('README.md', 'README.tr.md')) {
    $rootReadme = Read-RepoText $rootReadmePath
    $rootReadme = [regex]::Replace(
        $rootReadme,
        '(?m)(\[Makaytron Etsy Message Assistant\]\([^\r\n]+\)\s*\|\s*)1\.2\.6(\s*\|)',
        '${1}1.2.7$2',
        1
    )
    if ($rootReadme -notmatch '(?m)\[Makaytron Etsy Message Assistant\]\([^\r\n]+\)\s*\|\s*1\.2\.7\s*\|') {
        throw "$rootReadmePath Message Assistant version was not updated."
    }
    Write-RepoText $rootReadmePath $rootReadme
}

$changelogPath = 'scripts/etsy-message-assistant/CHANGELOG.md'
$changelog = Read-RepoText $changelogPath
if ($changelog -notmatch '(?m)^## \[1\.2\.7\] - 2026-09-02$') {
$entry = @'
## [Unreleased]

## [1.2.7] - 2026-09-02

### Fixed

- Varsayılan imza boş olduğunda teslimat sonrası yorum talebi şablonunun sonunda kalan boşluklar artık gönderimden önce kanonikleştiriliyor; Otopilot canlı composer/hash karşılaştırmasında aynı mesajı farklı sanıp fail-closed durmuyor.

### Security

- Public varsayılan mağaza kimliği artık kişiselleştirilmiş imza taşımıyor; `shopName` ve `signature` alanları yeni kurulumlarda boş başlıyor.
- Public fixture privacy guard, Message Assistant için varsayılan `shopName` ve `signature` değerlerinin boş kalmasını CI'da zorunlu tutuyor.

'@
    $changelog = [regex]::Replace($changelog, '(?m)^## \[Unreleased\]\r?\n', $entry, 1)
}
if ($changelog -notmatch '(?m)^## \[1\.2\.7\] - 2026-09-02$') { throw 'Changelog 1.2.7 entry was not added.' }
Write-RepoText $changelogPath $changelog

Write-Host 'Prepared Message Assistant 1.2.7 source and documentation.'
