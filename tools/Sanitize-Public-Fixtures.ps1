param(
    [switch]$Fix
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
$shopNamePattern = 'shopName:\s*[''"]([^''"]+)[''"]'
$shopIdPattern = 'shopId:\s*[''"](\d{6,})[''"]'

function Read-RepoText([string]$relativePath) {
    $path = Join-Path $repoRoot $relativePath
    if (-not (Test-Path -LiteralPath $path)) { return $null }
    return [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
}

function Write-RepoText([string]$relativePath, [string]$content) {
    $path = Join-Path $repoRoot $relativePath
    [System.IO.File]::WriteAllText($path, $content, $utf8NoBom)
}

function Get-UniqueMatchValues([string]$text, [string]$pattern) {
    $seen = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
    $values = [System.Collections.Generic.List[string]]::new()
    foreach ($match in [regex]::Matches($text, $pattern)) {
        $value = $match.Groups[1].Value
        if ($seen.Add($value)) { $values.Add($value) }
    }
    return $values
}

function Test-SyntheticShopName([string]$value) {
    return $value -match '^(?:SyntheticShop|ExampleShop|DemoShop|TestShop)(?:[-_ ]?[A-Za-z0-9]+)?$'
}

function Test-SyntheticShopId([string]$value) {
    return $value -match '^900000\d{2}$'
}

$fixturePath = 'tools/Test-Sale-Manager.mjs'
$fixtureText = Read-RepoText $fixturePath
if ($null -ne $fixtureText) {
    $updated = $fixtureText

    $realIds = @(Get-UniqueMatchValues $updated $shopIdPattern | Where-Object { -not (Test-SyntheticShopId $_) })
    for ($index = 0; $index -lt $realIds.Count; $index += 1) {
        $syntheticId = '900000{0:D2}' -f ($index + 1)
        $updated = $updated.Replace($realIds[$index], $syntheticId)
    }

    $realNames = @(Get-UniqueMatchValues $updated $shopNamePattern | Where-Object { -not (Test-SyntheticShopName $_) })
    for ($index = 0; $index -lt $realNames.Count; $index += 1) {
        $syntheticName = 'SyntheticShop{0:D2}' -f ($index + 1)
        $updated = $updated.Replace($realNames[$index], $syntheticName)
    }

    if ($Fix -and $updated -cne $fixtureText) {
        Write-RepoText $fixturePath $updated
    }
}

if ($Fix) {
    $screenshotRoot = Join-Path $repoRoot 'assets/screenshots'
    if (Test-Path -LiteralPath $screenshotRoot) {
        Get-ChildItem -LiteralPath $screenshotRoot -File -Filter 'message-assistant-*.png' |
            Remove-Item -Force
    }

    foreach ($readme in @('README.md', 'README.tr.md')) {
        $text = Read-RepoText $readme
        if ($null -eq $text) { continue }
        $pattern = '(?ms)^### Makaytron Etsy Message Assistant\r?\n.*?(?=^### Makaytron Etsy Ads Keyword Manager)'
        if ($readme -eq 'README.tr.md') {
            $replacement = @"
### Makaytron Etsy Message Assistant

> **Gizlilik:** Message Assistant ekran görüntüleri public repoda tutulmaz. Gerçek hesap, mağaza, müşteri veya sipariş verisinin görsel varlıklara karışmasını önlemek için yalnız tamamen sentetik fixture'lardan yeniden üretilecek görseller kabul edilir.

"@
        }
        else {
            $replacement = @"
### Makaytron Etsy Message Assistant

> **Privacy:** Message Assistant screenshots are not kept in the public repository. To prevent real account, shop, customer, or order data from entering visual assets, only screenshots regenerated from fully synthetic fixtures may be added.

"@
        }
        $updated = [regex]::Replace($text, $pattern, $replacement)
        if ($updated -cne $text) { Write-RepoText $readme $updated }
    }
}

$problems = [System.Collections.Generic.List[string]]::new()

$tracked = @(& git -C $repoRoot ls-files)
if ($LASTEXITCODE -ne 0) { throw 'git ls-files failed.' }
$textExtensions = @('.js', '.mjs', '.cjs', '.ts', '.tsx', '.json', '.md', '.txt', '.html', '.yml', '.yaml', '.ps1')
foreach ($relativePath in $tracked) {
    $extension = [System.IO.Path]::GetExtension($relativePath).ToLowerInvariant()
    if ($textExtensions -notcontains $extension) { continue }
    $text = Read-RepoText $relativePath
    if ($null -eq $text) { continue }

    $isFixtureSurface = $relativePath -like 'tools/*' -or $relativePath -like '*fixtures/*'
    if (-not $isFixtureSurface) { continue }

    $shopIdMatches = @([regex]::Matches($text, $shopIdPattern))
    if ($shopIdMatches.Count -eq 0) { continue }

    foreach ($match in $shopIdMatches) {
        $value = $match.Groups[1].Value
        if (-not (Test-SyntheticShopId $value)) {
            $problems.Add("$relativePath contains a non-synthetic literal shopId.")
        }
    }

    foreach ($match in [regex]::Matches($text, $shopNamePattern)) {
        $value = $match.Groups[1].Value
        if (-not (Test-SyntheticShopName $value)) {
            $problems.Add("$relativePath contains a non-synthetic literal shopName next to account fixture data.")
        }
    }
}

$screenshotRoot = Join-Path $repoRoot 'assets/screenshots'
if (Test-Path -LiteralPath $screenshotRoot) {
    $unsafeScreenshots = @(Get-ChildItem -LiteralPath $screenshotRoot -File -Filter 'message-assistant-*.png')
    foreach ($file in $unsafeScreenshots) {
        $problems.Add("assets/screenshots/$($file.Name) is prohibited until it is regenerated from an audited synthetic fixture.")
    }
}

foreach ($readme in @('README.md', 'README.tr.md')) {
    $text = Read-RepoText $readme
    if ($null -ne $text -and $text -match 'assets/screenshots/message-assistant-[^\s)]+\.png') {
        $problems.Add("$readme still references a Message Assistant screenshot that is not privacy-audited.")
    }
}

if ($problems.Count -gt 0) {
    $uniqueProblems = $problems | Sort-Object -Unique
    Write-Error ("Public fixture privacy validation failed:`n - " + ($uniqueProblems -join "`n - "))
    exit 1
}

Write-Host 'Public fixture privacy validation passed.'
