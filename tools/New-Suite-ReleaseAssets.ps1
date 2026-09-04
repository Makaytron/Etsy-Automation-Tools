[CmdletBinding()]
param(
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

$versionPath = Join-Path $repoRoot 'VERSION'
Assert-True (Test-Path -LiteralPath $versionPath -PathType Leaf) 'VERSION is missing.'
$version = ([System.IO.File]::ReadAllText($versionPath, [System.Text.Encoding]::UTF8)).Trim()
Assert-True ($version -match "^$strictSemVerPattern$") "VERSION is not strict SemVer: $version"
if (-not [string]::IsNullOrWhiteSpace($ExpectedVersion)) {
    Assert-True ($ExpectedVersion -match "^$strictSemVerPattern$") "ExpectedVersion is not strict SemVer: $ExpectedVersion"
    Assert-True ($ExpectedVersion -eq $version) "Expected version $ExpectedVersion does not match VERSION $version."
}

$releaseNotesPath = Join-Path $repoRoot "docs/releases/v$version.md"
Assert-True (Test-Path -LiteralPath $releaseNotesPath -PathType Leaf) "Suite release notes are missing: docs/releases/v$version.md"

$registryPath = Join-Path $repoRoot 'config/production-packages.json'
Assert-True (Test-Path -LiteralPath $registryPath -PathType Leaf) 'Production package registry is missing.'
$registry = @(ConvertFrom-Json -InputObject ([System.IO.File]::ReadAllText($registryPath, [System.Text.Encoding]::UTF8)))
Assert-True ($registry.Count -eq 5) "Suite release requires exactly five registered production packages; found $($registry.Count)."

$scriptAssets = @(
    foreach ($package in $registry) {
        $relativePath = [string]$package.scriptPath
        Assert-True (-not [string]::IsNullOrWhiteSpace($relativePath)) "Registry entry $($package.packageSlug) has no scriptPath."
        $fullPath = Join-Path $repoRoot $relativePath.Replace('/', [System.IO.Path]::DirectorySeparatorChar)
        Assert-True (Test-Path -LiteralPath $fullPath -PathType Leaf) "Registered userscript is missing: $relativePath"
        Get-Item -LiteralPath $fullPath
    }
)
$assetNames = @($scriptAssets | ForEach-Object { $_.Name })
Assert-True ((@($assetNames | Select-Object -Unique)).Count -eq $scriptAssets.Count) 'Suite userscript asset filenames must be unique.'

$gitStatus = & git -C $repoRoot status --porcelain --untracked-files=no
Assert-True ($LASTEXITCODE -eq 0) 'git status failed.'
Assert-True ([string]::IsNullOrWhiteSpace(($gitStatus -join "`n"))) 'Suite release assets must be built from a clean tracked working tree.'

if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
    $OutputDirectory = Join-Path $repoRoot "release-assets/suite-v$version"
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

$zipName = "Etsy-Automation-Tools-v$version.zip"
$zipPath = Join-Path $OutputDirectory $zipName
$archivePrefix = "Etsy-Automation-Tools-v$version/"
& git -C $repoRoot archive --format=zip "--prefix=$archivePrefix" "--output=$zipPath" HEAD
Assert-True ($LASTEXITCODE -eq 0) 'git archive failed while building the suite ZIP.'
Assert-True (Test-Path -LiteralPath $zipPath -PathType Leaf) "Suite ZIP was not created: $zipPath"
Assert-True ((Get-Item -LiteralPath $zipPath).Length -gt 0) 'Suite ZIP is empty.'

foreach ($script in $scriptAssets) {
    $destination = Join-Path $OutputDirectory $script.Name
    [System.IO.File]::WriteAllBytes($destination, [System.IO.File]::ReadAllBytes($script.FullName))
}

$hashTargets = @((Get-Item -LiteralPath $zipPath)) + @(
    $scriptAssets | ForEach-Object { Get-Item -LiteralPath (Join-Path $OutputDirectory $_.Name) }
)
$manifestLines = @(
    foreach ($asset in @($hashTargets | Sort-Object Name)) {
        $hash = (Get-FileHash -LiteralPath $asset.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        "$hash  $($asset.Name)"
    }
)
$manifestPath = Join-Path $OutputDirectory 'SHA256SUMS.txt'
[System.IO.File]::WriteAllText($manifestPath, (($manifestLines -join "`n") + "`n"), [System.Text.UTF8Encoding]::new($false))

foreach ($script in $scriptAssets) {
    $packagedPath = Join-Path $OutputDirectory $script.Name
    $sourceHash = (Get-FileHash -LiteralPath $script.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    $packagedHash = (Get-FileHash -LiteralPath $packagedPath -Algorithm SHA256).Hash.ToLowerInvariant()
    Assert-True ($sourceHash -eq $packagedHash) "Packaged userscript differs from source: $($script.Name)"
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
try {
    $entryNames = @($archive.Entries | ForEach-Object { $_.FullName })
    Assert-True ($entryNames -contains "${archivePrefix}VERSION") 'Suite ZIP is missing VERSION.'
    Assert-True ($entryNames -contains "${archivePrefix}docs/releases/v$version.md") 'Suite ZIP is missing the matching release note.'
    foreach ($package in $registry) {
        Assert-True ($entryNames -contains ($archivePrefix + [string]$package.scriptPath)) "Suite ZIP is missing registered userscript: $($package.scriptPath)"
    }
}
finally {
    $archive.Dispose()
}

$expectedOutputNames = @($zipName, 'SHA256SUMS.txt') + @($assetNames)
$actualOutputNames = @(Get-ChildItem -LiteralPath $OutputDirectory -File | ForEach-Object { $_.Name })
Assert-True ($actualOutputNames.Count -eq $expectedOutputNames.Count) "Suite output contains an unexpected number of files: $($actualOutputNames.Count)."
foreach ($name in $expectedOutputNames) {
    Assert-True ($actualOutputNames -contains $name) "Suite output is missing expected asset: $name"
}

Write-Host "PACKAGED suite v$version assets=$($expectedOutputNames.Count)"
Write-Host "ZIP $zipPath"
Write-Host "MANIFEST $manifestPath"

[pscustomobject]@{
    Version = $version
    OutputDirectory = $OutputDirectory
    ZipPath = $zipPath
    ManifestPath = $manifestPath
    AssetNames = @($expectedOutputNames | Sort-Object)
}
