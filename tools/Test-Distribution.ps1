[CmdletBinding()]
param(
    [switch]$Online
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$versionPath = Join-Path $repoRoot 'VERSION'
$canonicalRepo = 'https://github.com/Makaytron/Etsy-Automation-Tools'
$canonicalRaw = 'https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/main'

function Assert-True {
    param(
        [bool]$Condition,
        [string]$Message
    )
    if (-not $Condition) {
        throw $Message
    }
}

function Metadata-Values {
    param(
        [string]$Source,
        [string]$Key
    )
    return @(
        [regex]::Matches(
            $Source,
            "(?m)^// @$([regex]::Escape($Key))\s+(.+?)\r?$"
        ) | ForEach-Object { $_.Groups[1].Value.Trim() }
    )
}

Assert-True (Test-Path -LiteralPath $versionPath -PathType Leaf) 'VERSION is missing.'
$version = (Get-Content -LiteralPath $versionPath -Raw -Encoding UTF8).Trim()
Assert-True ($version -match '^\d+\.\d+\.\d+$') "VERSION is not strict SemVer: $version"

$scripts = @(Get-ChildItem -LiteralPath (Join-Path $repoRoot 'scripts') -Filter '*.user.js' -File -Recurse | Sort-Object FullName)
Assert-True ($scripts.Count -eq 5) "Expected exactly five standalone userscripts; found $($scripts.Count)."

$onlineUrls = [System.Collections.Generic.List[string]]::new()
$onlineUrls.Add($canonicalRepo)
$onlineUrls.Add("$canonicalRepo/issues")
$onlineUrls.Add('https://api.github.com/repos/Makaytron/Etsy-Automation-Tools/commits/main')

foreach ($script in $scripts) {
    $source = [System.IO.File]::ReadAllText($script.FullName, [System.Text.Encoding]::UTF8)
    $relativePath = $script.FullName.Substring($repoRoot.Length + 1).Replace('\', '/')
    $slug = $script.Directory.Name
    $expectedRaw = "$canonicalRaw/$relativePath"
    $expectedHomepage = "$canonicalRepo/tree/main/scripts/$slug"

    $metadataVersion = @(Metadata-Values -Source $source -Key 'version')
    Assert-True ($metadataVersion.Count -eq 1) "$relativePath must contain exactly one @version."
    Assert-True ($metadataVersion[0] -eq $version) "$relativePath metadata version $($metadataVersion[0]) does not match VERSION $version."

    $runtimePattern = '(?m)^\s*const\s+(?:APP_VERSION|VERSION)\s*=\s*[''"](?<version>\d+\.\d+\.\d+)[''"]\s*;\s*\r?$'
    $runtimeMatches = @([regex]::Matches($source, $runtimePattern))
    Assert-True ($runtimeMatches.Count -eq 1) "$relativePath must contain exactly one runtime version marker."
    Assert-True ($runtimeMatches[0].Groups['version'].Value -eq $version) "$relativePath runtime version does not match VERSION $version."

    Assert-True ((Metadata-Values -Source $source -Key 'homepageURL') -join '' -eq $expectedHomepage) "$relativePath has a non-canonical @homepageURL."
    Assert-True ((Metadata-Values -Source $source -Key 'supportURL') -join '' -eq "$canonicalRepo/issues") "$relativePath has a non-canonical @supportURL."
    Assert-True ((Metadata-Values -Source $source -Key 'updateURL') -join '' -eq $expectedRaw) "$relativePath has a non-canonical @updateURL."
    Assert-True ((Metadata-Values -Source $source -Key 'downloadURL') -join '' -eq $expectedRaw) "$relativePath has a non-canonical @downloadURL."
    Assert-True ((Metadata-Values -Source $source -Key 'antifeature') -join '' -eq 'tracking') "$relativePath must disclose @antifeature tracking."

    $legacyLiveUrl = [regex]::IsMatch($source, '(?m)^// @(?:homepageURL|supportURL|updateURL|downloadURL)\s+.*Makaytron/EtsyScript')
    Assert-True (-not $legacyLiveUrl) "$relativePath uses the retired repository in a live metadata URL."

    & node --check $script.FullName
    Assert-True ($LASTEXITCODE -eq 0) "node --check failed for $relativePath."
    $onlineUrls.Add($expectedRaw)
    Write-Host "PASS $relativePath $version"
}

$secretPatterns = @(
    ('-----BEGIN ' + '(?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
    ('github_' + 'pat_[A-Za-z0-9_]{20,}'),
    ('gh' + '[pousr]_[A-Za-z0-9]{20,}'),
    ('sb_' + 'secret_[A-Za-z0-9_-]{20,}'),
    ('xox' + '[baprs]-[A-Za-z0-9-]{20,}')
)
$textExtensions = @('.js', '.json', '.md', '.ps1', '.txt', '.yaml', '.yml')
$repositoryFiles = @(& git -C $repoRoot ls-files --cached --others --exclude-standard)
Assert-True ($LASTEXITCODE -eq 0) 'git ls-files failed.'
foreach ($relative in $repositoryFiles) {
    $path = Join-Path $repoRoot $relative
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { continue }
    if ($textExtensions -notcontains [System.IO.Path]::GetExtension($path).ToLowerInvariant()) { continue }
    $content = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
    foreach ($pattern in $secretPatterns) {
        Assert-True (-not [regex]::IsMatch($content, $pattern)) "Potential credential pattern detected in $relative."
    }
}

if ($Online) {
    foreach ($url in @($onlineUrls | Sort-Object -Unique)) {
        try {
            $response = Invoke-WebRequest -Uri $url -Method Head -MaximumRedirection 8 -TimeoutSec 30 -UseBasicParsing -Headers @{ 'User-Agent' = 'Makaytron-distribution-validator' }
            Assert-True ([int]$response.StatusCode -eq 200) "Unexpected HTTP status for ${url}: $($response.StatusCode)"
            Write-Host "HTTP 200 $url"
        }
        catch {
            throw "Online URL validation failed for $url`: $($_.Exception.Message)"
        }
    }
}

Write-Host "Distribution validation passed for five userscripts at version $version."
