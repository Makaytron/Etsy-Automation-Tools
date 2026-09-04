[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$builderPath = Join-Path $PSScriptRoot 'New-Suite-ReleaseAssets.ps1'

function Assert-True {
    param(
        [bool]$Condition,
        [string]$Message
    )
    if (-not $Condition) {
        throw $Message
    }
}

Assert-True (Test-Path -LiteralPath $builderPath -PathType Leaf) 'Suite release builder is missing.'
$version = ([System.IO.File]::ReadAllText((Join-Path $repoRoot 'VERSION'), [System.Text.Encoding]::UTF8)).Trim()
$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("makaytron-suite-assets-" + [guid]::NewGuid().ToString('N'))
$first = Join-Path $testRoot 'first'
$second = Join-Path $testRoot 'second'

try {
    $null = New-Item -ItemType Directory -Path $first -Force
    $null = New-Item -ItemType Directory -Path $second -Force

    & $builderPath -ExpectedVersion $version -OutputDirectory $first | Out-Null
    & $builderPath -ExpectedVersion $version -OutputDirectory $second | Out-Null

    $firstFiles = @(Get-ChildItem -LiteralPath $first -File | Sort-Object Name)
    $secondFiles = @(Get-ChildItem -LiteralPath $second -File | Sort-Object Name)
    Assert-True ($firstFiles.Count -eq 7) "Expected exactly seven suite release assets, found $($firstFiles.Count)."
    Assert-True ($secondFiles.Count -eq 7) "Second suite build produced $($secondFiles.Count) assets instead of seven."

    $firstNames = @($firstFiles | ForEach-Object { $_.Name })
    $secondNames = @($secondFiles | ForEach-Object { $_.Name })
    Assert-True (($firstNames -join "`n") -eq ($secondNames -join "`n")) 'Suite build output filenames are not deterministic.'

    foreach ($name in $firstNames) {
        $firstPath = Join-Path $first $name
        $secondPath = Join-Path $second $name
        $firstHash = (Get-FileHash -LiteralPath $firstPath -Algorithm SHA256).Hash.ToLowerInvariant()
        $secondHash = (Get-FileHash -LiteralPath $secondPath -Algorithm SHA256).Hash.ToLowerInvariant()
        Assert-True ($firstHash -eq $secondHash) "Suite release asset is not deterministic across two builds: $name"
    }

    $manifest = [System.IO.File]::ReadAllText((Join-Path $first 'SHA256SUMS.txt'), [System.Text.Encoding]::UTF8)
    $manifestLines = @($manifest -split "`n" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    Assert-True ($manifestLines.Count -eq 6) "Suite SHA256SUMS.txt must contain exactly six entries; found $($manifestLines.Count)."
    $zipManifestMatches = @($manifestLines | Where-Object { $_ -match "  Etsy-Automation-Tools-v$([regex]::Escape($version))\.zip$" })
    Assert-True ($zipManifestMatches.Count -eq 1) "Suite checksum manifest must contain the suite ZIP exactly once; found $($zipManifestMatches.Count)."

    Write-Host "PASS suite release asset determinism: version=$version assets=7 manifestEntries=6"
}
finally {
    if (Test-Path -LiteralPath $testRoot) {
        Remove-Item -LiteralPath $testRoot -Recurse -Force
    }
}
