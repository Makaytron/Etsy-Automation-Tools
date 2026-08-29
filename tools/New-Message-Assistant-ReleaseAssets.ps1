[CmdletBinding()]
param(
    [string]$ExpectedVersion = '',
    [string]$OutputDirectory = ''
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$packageSlug = 'etsy-message-assistant'
$scriptName = 'Makaytron-Etsy-Message-Assistant.user.js'
$scriptPath = Join-Path $repoRoot "scripts/$packageSlug/$scriptName"

function Assert-True {
    param(
        [bool]$Condition,
        [string]$Message
    )
    if (-not $Condition) {
        throw $Message
    }
}

Assert-True (Test-Path -LiteralPath $scriptPath -PathType Leaf) "Userscript is missing: $scriptPath"
$scriptBytes = [System.IO.File]::ReadAllBytes($scriptPath)
$scriptSource = [System.Text.UTF8Encoding]::new($false, $true).GetString($scriptBytes)

$strictSemVerPattern = '(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)'
$metadataPattern = '(?m)^//\s+@version\s+(?<version>{0})\s*\r?$' -f $strictSemVerPattern
$metadataMatches = @([regex]::Matches($scriptSource, $metadataPattern))
Assert-True ($metadataMatches.Count -eq 1) 'Userscript must contain exactly one strict-SemVer @version.'
$version = $metadataMatches[0].Groups['version'].Value

$runtimePattern = '(?m)^\s*const\s+APP_VERSION\s*=\s*[''"](?<version>{0})[''"]\s*;\s*\r?$' -f $strictSemVerPattern
$runtimeMatches = @([regex]::Matches($scriptSource, $runtimePattern))
Assert-True ($runtimeMatches.Count -eq 1) 'Userscript must contain exactly one strict-SemVer APP_VERSION.'
Assert-True ($runtimeMatches[0].Groups['version'].Value -eq $version) "APP_VERSION does not match @version $version."

if (-not [string]::IsNullOrWhiteSpace($ExpectedVersion)) {
    Assert-True ($ExpectedVersion -match "^$strictSemVerPattern$") "ExpectedVersion is not strict SemVer: $ExpectedVersion"
    Assert-True ($ExpectedVersion -eq $version) "Expected version $ExpectedVersion does not match userscript version $version."
}

$changelogPath = Join-Path $repoRoot "scripts/$packageSlug/CHANGELOG.md"
$changelogSource = [System.IO.File]::ReadAllText($changelogPath, [System.Text.Encoding]::UTF8)
$latestChangelog = [regex]::Match($changelogSource, '(?m)^##\s+\[?(?<version>\d+\.\d+\.\d+)\]?')
Assert-True ($latestChangelog.Success -and $latestChangelog.Groups['version'].Value -eq $version) "Latest changelog entry does not match $version."

if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
    $OutputDirectory = Join-Path $repoRoot "release-assets/$packageSlug-v$version"
}
elseif (-not [System.IO.Path]::IsPathRooted($OutputDirectory)) {
    $OutputDirectory = Join-Path $repoRoot $OutputDirectory
}
$OutputDirectory = [System.IO.Path]::GetFullPath($OutputDirectory)

if (Test-Path -LiteralPath $OutputDirectory) {
    Assert-True (Test-Path -LiteralPath $OutputDirectory -PathType Container) "Output path is not a directory: $OutputDirectory"
    $existingEntries = @(Get-ChildItem -LiteralPath $OutputDirectory -Force)
    Assert-True ($existingEntries.Count -eq 0) "Output directory must be empty: $OutputDirectory"
}
else {
    $null = New-Item -ItemType Directory -Path $OutputDirectory
}

$assetPath = Join-Path $OutputDirectory $scriptName
$manifestPath = Join-Path $OutputDirectory 'SHA256SUMS.txt'
Assert-True (-not (Test-Path -LiteralPath $assetPath)) "Release asset already exists: $assetPath"
Assert-True (-not (Test-Path -LiteralPath $manifestPath)) "Checksum manifest already exists: $manifestPath"

[System.IO.File]::WriteAllBytes($assetPath, $scriptBytes)
$sha256 = [System.Security.Cryptography.SHA256]::Create()
try {
    $hash = ([System.BitConverter]::ToString($sha256.ComputeHash($scriptBytes))).Replace('-', '').ToLowerInvariant()
}
finally {
    $sha256.Dispose()
}
[System.IO.File]::WriteAllText($manifestPath, "$hash  $scriptName`n", [System.Text.UTF8Encoding]::new($false))

$packagedBytes = [System.IO.File]::ReadAllBytes($assetPath)
$packagedHash = (Get-FileHash -LiteralPath $assetPath -Algorithm SHA256).Hash.ToLowerInvariant()
Assert-True ($packagedBytes.Length -eq $scriptBytes.Length -and $packagedHash -eq $hash) 'Packaged userscript is not byte-identical to its source.'
$manifestSource = [System.IO.File]::ReadAllText($manifestPath, [System.Text.Encoding]::UTF8)
Assert-True ($manifestSource -eq "$hash  $scriptName`n") 'SHA256SUMS.txt has unexpected content.'

Write-Host "PACKAGED $packageSlug v$version"
Write-Host "ASSET $assetPath"
Write-Host "SHA256 $hash"
Write-Host "MANIFEST $manifestPath"

[pscustomobject]@{
    PackageSlug = $packageSlug
    Version = $version
    OutputDirectory = $OutputDirectory
    AssetPath = $assetPath
    ManifestPath = $manifestPath
    Sha256 = $hash
}
