[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$PackageSlug,
    [string]$ExpectedVersion = '',
    [string]$OutputDirectory = ''
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$strictSemVerPattern = '(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)'

function Assert-True {
    param(
        [bool]$Condition,
        [string]$Message
    )
    if (-not $Condition) {
        throw $Message
    }
}

Assert-True ($PackageSlug -match '^[a-z0-9]+(?:-[a-z0-9]+)*$') "PackageSlug is invalid: $PackageSlug"
$packagePath = Join-Path $repoRoot "scripts/$PackageSlug"
Assert-True (Test-Path -LiteralPath $packagePath -PathType Container) "Unknown standalone package: $PackageSlug"

$scriptFiles = @(Get-ChildItem -LiteralPath $packagePath -Filter '*.user.js' -File)
Assert-True ($scriptFiles.Count -eq 1) "$PackageSlug must contain exactly one .user.js file; found $($scriptFiles.Count)."
$scriptFile = $scriptFiles[0]
$scriptName = $scriptFile.Name
$scriptPath = $scriptFile.FullName
$scriptBytes = [System.IO.File]::ReadAllBytes($scriptPath)
$scriptSource = [System.Text.UTF8Encoding]::new($false, $true).GetString($scriptBytes)

$metadataPattern = '(?m)^//\s+@version\s+(?<version>{0})\s*\r?$' -f $strictSemVerPattern
$metadataMatches = @([regex]::Matches($scriptSource, $metadataPattern))
Assert-True ($metadataMatches.Count -eq 1) "$PackageSlug userscript must contain exactly one strict-SemVer @version."
$version = $metadataMatches[0].Groups['version'].Value

$runtimePattern = '(?m)^\s*const\s+(?<name>APP_VERSION|VERSION)\s*=\s*[''"](?<version>{0})[''"]\s*;\s*\r?$' -f $strictSemVerPattern
$runtimeMatches = @([regex]::Matches($scriptSource, $runtimePattern))
Assert-True ($runtimeMatches.Count -eq 1) "$PackageSlug userscript must contain exactly one APP_VERSION or VERSION marker."
Assert-True ($runtimeMatches[0].Groups['version'].Value -eq $version) "$($runtimeMatches[0].Groups['name'].Value) does not match @version $version."

if (-not [string]::IsNullOrWhiteSpace($ExpectedVersion)) {
    Assert-True ($ExpectedVersion -match "^$strictSemVerPattern$") "ExpectedVersion is not strict SemVer: $ExpectedVersion"
    Assert-True ($ExpectedVersion -eq $version) "Expected version $ExpectedVersion does not match userscript version $version."
}

foreach ($readmeName in @('README.md', 'README.en.md')) {
    $readmePath = Join-Path $packagePath $readmeName
    Assert-True (Test-Path -LiteralPath $readmePath -PathType Leaf) "$PackageSlug/$readmeName is missing."
    $readmeSource = [System.IO.File]::ReadAllText($readmePath, [System.Text.Encoding]::UTF8)
    $versionPattern = '(?m)^(?:\*\*[^*\r\n]+:\*\*|Version:)\s+`?{0}`?(?:\s|$)' -f [regex]::Escape($version)
    Assert-True ([regex]::IsMatch($readmeSource, $versionPattern)) "$PackageSlug/$readmeName does not declare current version $version."
}

$changelogPath = Join-Path $packagePath 'CHANGELOG.md'
Assert-True (Test-Path -LiteralPath $changelogPath -PathType Leaf) "$PackageSlug/CHANGELOG.md is missing."
$changelogSource = [System.IO.File]::ReadAllText($changelogPath, [System.Text.Encoding]::UTF8)
$latestChangelog = [regex]::Match($changelogSource, '(?m)^##\s+\[?(?<version>\d+\.\d+\.\d+)\]?')
Assert-True ($latestChangelog.Success -and $latestChangelog.Groups['version'].Value -eq $version) "$PackageSlug latest changelog entry does not match $version."

if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
    $OutputDirectory = Join-Path $repoRoot "release-assets/$PackageSlug-v$version"
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

Write-Host "PACKAGED $PackageSlug v$version"
Write-Host "ASSET $assetPath"
Write-Host "SHA256 $hash"
Write-Host "MANIFEST $manifestPath"

[pscustomobject]@{
    PackageSlug = $PackageSlug
    Version = $version
    ScriptName = $scriptName
    OutputDirectory = $OutputDirectory
    AssetPath = $assetPath
    ManifestPath = $manifestPath
    Sha256 = $hash
}
