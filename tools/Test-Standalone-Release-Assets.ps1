[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("makaytron-standalone-assets-" + [guid]::NewGuid().ToString('N'))
$worktreePath = Join-Path $testRoot 'worktree'
$cleanOutput = Join-Path $testRoot 'clean-output'
$dirtyOutput = Join-Path $testRoot 'dirty-output'

function Assert-True {
    param(
        [bool]$Condition,
        [string]$Message
    )
    if (-not $Condition) {
        throw $Message
    }
}

try {
    $null = New-Item -ItemType Directory -Path $testRoot -Force
    & git -C $repoRoot worktree add --detach $worktreePath HEAD | Out-Null
    Assert-True ($LASTEXITCODE -eq 0) 'Failed to create temporary detached worktree.'

    $builderPath = Join-Path $worktreePath 'tools/New-Standalone-ReleaseAssets.ps1'
    Assert-True (Test-Path -LiteralPath $builderPath -PathType Leaf) 'Standalone builder is missing from the temporary worktree.'

    $null = New-Item -ItemType Directory -Path $cleanOutput -Force
    & $builderPath -PackageSlug 'etsy-ads-keyword-manager' -OutputDirectory $cleanOutput | Out-Null
    $cleanFiles = @(Get-ChildItem -LiteralPath $cleanOutput -File | Sort-Object Name)
    Assert-True ($cleanFiles.Count -eq 2) "Clean standalone build must produce exactly two files; found $($cleanFiles.Count)."
    Assert-True (($cleanFiles | Where-Object Name -eq 'SHA256SUMS.txt').Count -eq 1) 'Clean standalone build is missing SHA256SUMS.txt.'
    Assert-True (($cleanFiles | Where-Object Name -Like '*.user.js').Count -eq 1) 'Clean standalone build must contain exactly one userscript.'

    $dirtyTrackedPath = Join-Path $worktreePath 'SUPPORT.md'
    Assert-True (Test-Path -LiteralPath $dirtyTrackedPath -PathType Leaf) 'Tracked dirty-tree fixture file is missing.'
    [System.IO.File]::AppendAllText($dirtyTrackedPath, "`n<!-- standalone-release-dirty-tree-test -->`n", [System.Text.UTF8Encoding]::new($false))

    $null = New-Item -ItemType Directory -Path $dirtyOutput -Force
    $rejectedDirtyTree = $false
    try {
        & $builderPath -PackageSlug 'etsy-ads-keyword-manager' -OutputDirectory $dirtyOutput | Out-Null
    }
    catch {
        $rejectedDirtyTree = $_.Exception.Message -match 'clean tracked working tree'
    }
    Assert-True $rejectedDirtyTree 'Standalone builder did not reject a dirty tracked worktree.'
    Assert-True (@(Get-ChildItem -LiteralPath $dirtyOutput -Force).Count -eq 0) 'Dirty-tree rejection must happen before release assets are written.'

    Write-Host 'PASS standalone release assets: clean tree accepted, dirty tracked tree rejected before output.'
}
finally {
    if (Test-Path -LiteralPath $worktreePath) {
        & git -C $repoRoot worktree remove --force $worktreePath | Out-Null
    }
    & git -C $repoRoot worktree prune | Out-Null
    if (Test-Path -LiteralPath $testRoot) {
        Remove-Item -LiteralPath $testRoot -Recurse -Force
    }
}
