[CmdletBinding()]
param(
    [switch]$Online,
    [switch]$RemoteParity
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$versionPath = Join-Path $repoRoot 'VERSION'
$canonicalRepo = 'https://github.com/Makaytron/Etsy-Automation-Tools'
$canonicalRaw = 'https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/main'

if ($RemoteParity -and -not $Online) {
    throw '-RemoteParity requires -Online.'
}

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

function Get-Sha256Hex {
    param([byte[]]$Bytes)

    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
        return ([System.BitConverter]::ToString($sha256.ComputeHash($Bytes))).Replace('-', '').ToLowerInvariant()
    }
    finally {
        $sha256.Dispose()
    }
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
$remoteParityFiles = [System.Collections.Generic.List[object]]::new()

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
    $remoteParityFiles.Add([pscustomobject]@{
        Url = $expectedRaw
        Path = $script.FullName
        RelativePath = $relativePath
    })
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

if ($RemoteParity) {
    Add-Type -AssemblyName System.Net.Http
    $httpClient = [System.Net.Http.HttpClient]::new()
    $httpClient.DefaultRequestHeaders.UserAgent.ParseAdd('Makaytron-distribution-validator')
    try {
        foreach ($check in $remoteParityFiles) {
            $remoteBytes = $httpClient.GetByteArrayAsync($check.Url).GetAwaiter().GetResult()
            $localBytes = [System.IO.File]::ReadAllBytes($check.Path)
            $remoteHash = Get-Sha256Hex -Bytes $remoteBytes
            $localHash = Get-Sha256Hex -Bytes $localBytes
            Assert-True ($remoteHash -eq $localHash) "Remote Raw content mismatch for $($check.RelativePath): local $localHash, remote $remoteHash"
            Write-Host "REMOTE MATCH $($check.RelativePath) $remoteHash"
        }
    }
    finally {
        $httpClient.Dispose()
    }
}

Write-Host "Distribution validation passed for five userscripts at version $version."
