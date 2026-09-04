[CmdletBinding()]
param(
    [string]$ExpectedVersion = '',
    [string]$OutputDirectory = ''
)

$ErrorActionPreference = 'Stop'
$builderPath = Join-Path $PSScriptRoot 'New-Standalone-ReleaseAssets.ps1'
if (-not (Test-Path -LiteralPath $builderPath -PathType Leaf)) {
    throw "Generic standalone release builder is missing: $builderPath"
}

& $builderPath `
    -PackageSlug 'etsy-message-assistant' `
    -ExpectedVersion $ExpectedVersion `
    -OutputDirectory $OutputDirectory
