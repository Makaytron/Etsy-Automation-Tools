param(
    [switch]$Fix
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
$shopNamePattern = 'shopName:\s*[''"]([^''"]+)[''"]'
$shopIdPattern = 'shopId:\s*[''"](\d{6,})[''"]'
$messageAssistantPath = 'scripts/etsy-message-assistant/Makaytron-Etsy-Message-Assistant.user.js'
$messageAssistantDefaultIdentityPattern = '(?m)(^\s*shopName:\s*'''',\r?\n)(\s*)signature:\s*''[^'']*'','
$messageAssistantNeutralDefaultsPattern = '(?m)^\s*shopName:\s*'''',\r?\n\s*signature:\s*'''','
$messageAssistantScreenshotPattern = 'assets/screenshots/(message-assistant-[A-Za-z0-9._-]+\.png)'
$approvedMessageAssistantPreview = [ordered]@{
    FileName = 'message-assistant-mkui-workspace-v1.2.9.png'
    Asset = 'assets/screenshots/message-assistant-mkui-workspace-v1.2.9.png'
    Manifest = 'docs/design/previews/message-assistant-mkui-workspace-v1.2.9.audit.json'
    Html = 'docs/design/previews/message-assistant-mkui-preview.html'
    Generator = 'tools/Generate-Mkui-Message-Assistant-Preview.mjs'
    ProductionScript = $messageAssistantPath
    ProductionVersion = '1.2.9'
    MkuiVersion = '1.0.0'
}

# SHA-256 hashes of account-specific literals that must never re-enter tracked public text.
# Keep only hashes here so the privacy guard itself does not republish the sensitive values.
$blockedLiteralHashes = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
@(
    'd46f0fe3643440087b136dbcc40db14d94a14bec4cd6d8eb167f98e2fdf763a7',
    '3a4e2596cd8de7ff0cc3508bf1ca98a7a3767218bb8dc9fbdd690f7c4949e88a'
) | ForEach-Object { [void]$blockedLiteralHashes.Add($_) }

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

function Get-Sha256Hex([string]$value) {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($value)
    $hash = [System.Security.Cryptography.SHA256]::HashData($bytes)
    return [Convert]::ToHexString($hash).ToLowerInvariant()
}

function Test-SyntheticShopName([string]$value) {
    return $value -match '^(?:SyntheticShop|ExampleShop|DemoShop|TestShop)(?:[-_ ]?[A-Za-z0-9]+)?$'
}

function Test-SyntheticShopId([string]$value) {
    return $value -match '^900000\d{2}$'
}

function Get-MessageAssistantScreenshotNames([string]$text) {
    if ([string]::IsNullOrEmpty($text)) { return @() }
    return @([regex]::Matches($text, $messageAssistantScreenshotPattern) | ForEach-Object { $_.Groups[1].Value })
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
        $updated = $updated.Replace("'$($realNames[$index])'", "'$syntheticName'")
    }

    if ($Fix -and $updated -cne $fixtureText) {
        Write-RepoText $fixturePath $updated
    }
}

if ($Fix) {
    $messageAssistantText = Read-RepoText $messageAssistantPath
    if ($null -ne $messageAssistantText) {
        $identityRegex = [regex]::new(
            $messageAssistantDefaultIdentityPattern,
            [System.Text.RegularExpressions.RegexOptions]::Multiline
        )
        $sanitizedMessageAssistant = $identityRegex.Replace(
            $messageAssistantText,
            {
                param($match)
                return "$($match.Groups[1].Value)$($match.Groups[2].Value)signature: '',"
            },
            1
        )
        if ($sanitizedMessageAssistant -cne $messageAssistantText) {
            Write-RepoText $messageAssistantPath $sanitizedMessageAssistant
        }
    }

    $screenshotRoot = Join-Path $repoRoot 'assets/screenshots'
    if (Test-Path -LiteralPath $screenshotRoot) {
        Get-ChildItem -LiteralPath $screenshotRoot -File -Filter 'message-assistant-*.png' |
            Where-Object { $_.Name -cne $approvedMessageAssistantPreview.FileName } |
            Remove-Item -Force
    }

    foreach ($readme in @('README.md', 'README.tr.md')) {
        $text = Read-RepoText $readme
        if ($null -eq $text) { continue }
        $references = @(Get-MessageAssistantScreenshotNames $text)
        $hasUnapprovedReference = @($references | Where-Object { $_ -cne $approvedMessageAssistantPreview.FileName }).Count -gt 0
        if (-not $hasUnapprovedReference) { continue }

        $pattern = '(?ms)^### Makaytron Etsy Message Assistant\r?\n.*?(?=^### Makaytron Etsy Ads Keyword Manager)'
        if ($readme -eq 'README.tr.md') {
            $replacement = @"
### Makaytron Etsy Message Assistant

> **Gizlilik:** Message Assistant ekran görüntüleri public repoda tutulmaz. Yalnız üretim CSS katmanlarından, ağ erişimi kapalı ve audit manifesti bulunan tamamen sentetik fixture ile yeniden üretilen onaylı önizleme tutulabilir.

"@
        }
        else {
            $replacement = @"
### Makaytron Etsy Message Assistant

> **Privacy:** Message Assistant screenshots are not kept in the public repository. The only permitted preview is generated from production CSS in a network-disabled, fully synthetic fixture with an audit manifest.

"@
        }
        $updated = [regex]::Replace($text, $pattern, $replacement)
        if ($updated -cne $text) { Write-RepoText $readme $updated }
    }
}

$problems = [System.Collections.Generic.List[string]]::new()

$messageAssistantText = Read-RepoText $messageAssistantPath
if ($null -eq $messageAssistantText) {
    $problems.Add("$messageAssistantPath is missing.")
}
elseif ($messageAssistantText -notmatch $messageAssistantNeutralDefaultsPattern) {
    $problems.Add("$messageAssistantPath must keep both default shopName and default signature empty.")
}

$tracked = @(& git -C $repoRoot ls-files)
if ($LASTEXITCODE -ne 0) { throw 'git ls-files failed.' }
$textExtensions = @('.js', '.mjs', '.cjs', '.ts', '.tsx', '.json', '.md', '.txt', '.html', '.yml', '.yaml', '.ps1')
foreach ($relativePath in $tracked) {
    $extension = [System.IO.Path]::GetExtension($relativePath).ToLowerInvariant()
    if ($textExtensions -notcontains $extension) { continue }
    $text = Read-RepoText $relativePath
    if ($null -eq $text) { continue }

    # Repo-wide hash guard: catch known account-specific names/IDs even when they are
    # pasted outside a structured shopName/shopId fixture field.
    foreach ($candidate in [regex]::Matches($text, '(?i)\b(?:[a-z][a-z0-9_-]{3,63}|\d{6,})\b')) {
        $normalized = $candidate.Value.ToLowerInvariant()
        if ($blockedLiteralHashes.Contains((Get-Sha256Hex $normalized))) {
            $problems.Add("$relativePath contains a blocked account-specific literal.")
            break
        }
    }

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
    $messageAssistantScreenshots = @(Get-ChildItem -LiteralPath $screenshotRoot -File -Filter 'message-assistant-*.png')
    foreach ($file in $messageAssistantScreenshots) {
        if ($file.Name -cne $approvedMessageAssistantPreview.FileName) {
            $problems.Add("assets/screenshots/$($file.Name) is not an approved audited synthetic preview.")
            continue
        }

        if ($file.Length -lt 40000) {
            $problems.Add("$($approvedMessageAssistantPreview.Asset) is unexpectedly small and may not be a valid rendered preview.")
        }

        $manifestText = Read-RepoText $approvedMessageAssistantPreview.Manifest
        if ($null -eq $manifestText) {
            $problems.Add("$($approvedMessageAssistantPreview.Manifest) is required for the approved preview.")
            continue
        }

        try {
            $audit = $manifestText | ConvertFrom-Json -ErrorAction Stop
        }
        catch {
            $problems.Add("$($approvedMessageAssistantPreview.Manifest) is not valid JSON.")
            continue
        }

        $requiredAuditValues = [ordered]@{
            asset = $approvedMessageAssistantPreview.Asset
            html = $approvedMessageAssistantPreview.Html
            generator = $approvedMessageAssistantPreview.Generator
            production_script = $approvedMessageAssistantPreview.ProductionScript
            production_version = $approvedMessageAssistantPreview.ProductionVersion
            mkui_version = $approvedMessageAssistantPreview.MkuiVersion
            data_classification = 'fully_synthetic'
            network_access = 'disabled'
        }
        foreach ($entry in $requiredAuditValues.GetEnumerator()) {
            if ([string]$audit.($entry.Key) -cne [string]$entry.Value) {
                $problems.Add("$($approvedMessageAssistantPreview.Manifest) has an invalid $($entry.Key) value.")
            }
        }
        if ([int]$audit.schema_version -ne 1) {
            $problems.Add("$($approvedMessageAssistantPreview.Manifest) must use schema_version 1.")
        }
        if ($audit.PSObject.Properties.Name -notcontains 'contains_real_account_data' -or $audit.contains_real_account_data -ne $false) {
            $problems.Add("$($approvedMessageAssistantPreview.Manifest) must explicitly declare contains_real_account_data=false.")
        }

        foreach ($requiredPath in @($approvedMessageAssistantPreview.Html, $approvedMessageAssistantPreview.Generator)) {
            if (-not (Test-Path -LiteralPath (Join-Path $repoRoot $requiredPath))) {
                $problems.Add("$requiredPath is required for the approved Message Assistant preview.")
            }
        }

        $previewHtml = Read-RepoText $approvedMessageAssistantPreview.Html
        if ($null -ne $previewHtml -and $previewHtml -notmatch 'Makaytron Etsy Message Assistant · MKUI 1\.0\.0') {
            $problems.Add("$($approvedMessageAssistantPreview.Html) does not identify the audited MKUI preview.")
        }
        $generatorText = Read-RepoText $approvedMessageAssistantPreview.Generator
        if ($null -ne $generatorText) {
            if ($generatorText -notmatch 'Makaytron-Etsy-Message-Assistant\.user\.js') {
                $problems.Add("$($approvedMessageAssistantPreview.Generator) must source production Message Assistant CSS.")
            }
            if ($generatorText -match '(?i)\b(?:fetch|xmlhttprequest|https?://)\s*\(') {
                $problems.Add("$($approvedMessageAssistantPreview.Generator) must remain network-independent.")
            }
        }

        if ($null -ne $messageAssistantText) {
            $currentVersionMatch = [regex]::Match($messageAssistantText, '(?m)^// @version\s+(\d+\.\d+\.\d+)\s*$')
            if (-not $currentVersionMatch.Success) {
                $problems.Add("$messageAssistantPath must contain one strict SemVer @version.")
            }
            else {
                try {
                    $currentProductionVersion = [version]$currentVersionMatch.Groups[1].Value
                    $previewProductionVersion = [version]$approvedMessageAssistantPreview.ProductionVersion
                    if ($currentProductionVersion -lt $previewProductionVersion) {
                        $problems.Add("$messageAssistantPath cannot predate the approved audited preview production version $($approvedMessageAssistantPreview.ProductionVersion).")
                    }
                }
                catch {
                    $problems.Add("$messageAssistantPath or approved preview has an invalid production version.")
                }
            }
            if ($messageAssistantText -notmatch "const MKUI_VERSION = '$($approvedMessageAssistantPreview.MkuiVersion)';") {
                $problems.Add("$messageAssistantPath must retain the MKUI version used by the approved audited preview.")
            }
        }
    }
}

foreach ($readme in @('README.md', 'README.tr.md')) {
    $text = Read-RepoText $readme
    if ($null -eq $text) { continue }
    foreach ($fileName in @(Get-MessageAssistantScreenshotNames $text)) {
        if ($fileName -cne $approvedMessageAssistantPreview.FileName) {
            $problems.Add("$readme references an unapproved Message Assistant screenshot: $fileName")
            continue
        }
        if (-not (Test-Path -LiteralPath (Join-Path $repoRoot $approvedMessageAssistantPreview.Asset))) {
            $problems.Add("$readme references the approved Message Assistant preview, but the asset is missing.")
        }
    }
}

if ($problems.Count -gt 0) {
    $uniqueProblems = $problems | Sort-Object -Unique
    Write-Error ("Public fixture privacy validation failed:`n - " + ($uniqueProblems -join "`n - "))
    exit 1
}

Write-Host 'Public fixture privacy validation passed.'
