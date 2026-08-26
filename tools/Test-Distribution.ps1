[CmdletBinding()]
param(
    [switch]$Online,
    [switch]$RemoteParity,
    [switch]$HostedChannels,
    [string]$PackageSlug = '',
    [switch]$StandaloneLatest
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Net.Http
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$versionPath = Join-Path $repoRoot 'VERSION'
$canonicalRepo = 'https://github.com/Makaytron/Etsy-Automation-Tools'
$canonicalRaw = 'https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/main'

if ($HostedChannels) {
    $Online = $true
    $RemoteParity = $true
}

if ($RemoteParity -and -not $Online) {
    throw '-RemoteParity requires -Online.'
}

if (-not [string]::IsNullOrWhiteSpace($PackageSlug) -and -not $HostedChannels) {
    throw '-PackageSlug requires -HostedChannels.'
}

if ($StandaloneLatest -and (-not $HostedChannels -or [string]::IsNullOrWhiteSpace($PackageSlug))) {
    throw '-StandaloneLatest requires -HostedChannels and -PackageSlug.'
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

function Get-Md5Hex {
    param([byte[]]$Bytes)

    $md5 = [System.Security.Cryptography.MD5]::Create()
    try {
        return ([System.BitConverter]::ToString($md5.ComputeHash($Bytes))).Replace('-', '').ToLowerInvariant()
    }
    finally {
        $md5.Dispose()
    }
}

function Normalize-HostedUserscript {
    param([string]$Source)

    $normalized = $Source.Replace("`r`n", "`n").Replace("`r", "`n")
    $insideMetadata = $false
    $lines = @(
        foreach ($line in @($normalized -split "`n")) {
            if ($line -eq '// ==UserScript==') {
                $insideMetadata = $true
            }
            if ($insideMetadata -and $line -match '^//\s+@(?:updateURL|downloadURL)\s+') {
                continue
            }
            $line
            if ($line -eq '// ==/UserScript==') {
                $insideMetadata = $false
            }
        }
    )
    return (($lines -join "`n").TrimEnd("`n"))
}

function Get-HttpBytes {
    param(
        [System.Net.Http.HttpClient]$Client,
        [string]$Url
    )

    try {
        return $Client.GetByteArrayAsync($Url).GetAwaiter().GetResult()
    }
    catch {
        throw "HTTP GET failed for $Url`: $($_.Exception.Message)"
    }
}

function Get-HttpUtf8 {
    param(
        [System.Net.Http.HttpClient]$Client,
        [string]$Url
    )

    $bytes = Get-HttpBytes -Client $Client -Url $Url
    return ([System.Text.UTF8Encoding]::new($false)).GetString($bytes)
}

function Assert-GreasyForkHostedUrl {
    param(
        [string]$Url,
        [int]$ScriptId,
        [string]$Suffix,
        [string]$Label
    )

    $parsed = $null
    Assert-True ([uri]::TryCreate($Url, [System.UriKind]::Absolute, [ref]$parsed)) "Greasy Fork $Label is not an absolute URL: $Url"
    Assert-True ($parsed.Scheme -eq 'https') "Greasy Fork $Label must use HTTPS: $Url"
    Assert-True ($parsed.Host -eq 'update.greasyfork.org') "Greasy Fork $Label has the wrong host: $Url"
    Assert-True ($parsed.IsDefaultPort) "Greasy Fork $Label has a non-default port: $Url"
    Assert-True ([string]::IsNullOrEmpty($parsed.UserInfo)) "Greasy Fork $Label must not contain credentials: $Url"
    Assert-True ([string]::IsNullOrEmpty($parsed.Query)) "Greasy Fork $Label must not contain a query: $Url"
    Assert-True ([string]::IsNullOrEmpty($parsed.Fragment)) "Greasy Fork $Label must not contain a fragment: $Url"
    $expectedPathPattern = '^/scripts/{0}/[^/]+{1}$' -f $ScriptId, [regex]::Escape($Suffix)
    Assert-True ([regex]::IsMatch($parsed.AbsolutePath, $expectedPathPattern)) "Greasy Fork $Label path mismatch: $Url"
}

Assert-True (Test-Path -LiteralPath $versionPath -PathType Leaf) 'VERSION is missing.'
$version = (Get-Content -LiteralPath $versionPath -Raw -Encoding UTF8).Trim()
Assert-True ($version -match '^\d+\.\d+\.\d+$') "VERSION is not strict SemVer: $version"

$scripts = @(Get-ChildItem -LiteralPath (Join-Path $repoRoot 'scripts') -Filter '*.user.js' -File -Recurse | Sort-Object FullName)
Assert-True ($scripts.Count -eq 5) "Expected exactly five standalone userscripts; found $($scripts.Count)."

$onlineUrls = [System.Collections.Generic.List[string]]::new()
$onlineUrls.Add($canonicalRepo)
$onlineUrls.Add("$canonicalRepo/issues")
$onlineUrls.Add("$canonicalRepo/discussions/categories/q-a")
$onlineUrls.Add('https://makaytron.com/contact')
$onlineUrls.Add('https://api.github.com/repos/Makaytron/Etsy-Automation-Tools/commits/main')
$remoteParityFiles = [System.Collections.Generic.List[object]]::new()
$scriptVersions = @{}
$scriptFilesBySlug = @{}

foreach ($script in $scripts) {
    $source = [System.IO.File]::ReadAllText($script.FullName, [System.Text.Encoding]::UTF8)
    $relativePath = $script.FullName.Substring($repoRoot.Length + 1).Replace('\', '/')
    $slug = $script.Directory.Name
    $expectedRaw = "$canonicalRaw/$relativePath"
    $expectedHomepage = "$canonicalRepo/tree/main/scripts/$slug"

    $metadataVersion = @(Metadata-Values -Source $source -Key 'version')
    Assert-True ($metadataVersion.Count -eq 1) "$relativePath must contain exactly one @version."
    $scriptVersion = $metadataVersion[0]
    Assert-True ($scriptVersion -match '^\d+\.\d+\.\d+$') "$relativePath @version is not strict SemVer: $scriptVersion"
    $scriptVersions[$slug] = $scriptVersion
    $scriptFilesBySlug[$slug] = $script.FullName

    $runtimePattern = '(?m)^\s*const\s+(?:APP_VERSION|VERSION)\s*=\s*[''"](?<version>\d+\.\d+\.\d+)[''"]\s*;\s*\r?$'
    $runtimeMatches = @([regex]::Matches($source, $runtimePattern))
    Assert-True ($runtimeMatches.Count -eq 1) "$relativePath must contain exactly one runtime version marker."
    Assert-True ($runtimeMatches[0].Groups['version'].Value -eq $scriptVersion) "$relativePath runtime version does not match @version $scriptVersion."

    $readmeVersionPattern = '(?m)^(?:\*\*[^*\r\n]+:\*\*|Version:)\s+`?{0}`?(?:\s|$)' -f [regex]::Escape($scriptVersion)
    foreach ($readmeName in @('README.md', 'README.en.md')) {
        $readmePath = Join-Path $script.Directory.FullName $readmeName
        Assert-True (Test-Path -LiteralPath $readmePath -PathType Leaf) "$slug/$readmeName is missing."
        $readmeSource = [System.IO.File]::ReadAllText($readmePath, [System.Text.Encoding]::UTF8)
        Assert-True ([regex]::IsMatch($readmeSource, $readmeVersionPattern)) "$slug/$readmeName does not declare current version $scriptVersion."
    }

    $changelogPath = Join-Path $script.Directory.FullName 'CHANGELOG.md'
    Assert-True (Test-Path -LiteralPath $changelogPath -PathType Leaf) "$slug/CHANGELOG.md is missing."
    $changelogSource = [System.IO.File]::ReadAllText($changelogPath, [System.Text.Encoding]::UTF8)
    $latestChangelog = [regex]::Match($changelogSource, '(?m)^##\s+\[?(?<version>\d+\.\d+\.\d+)\]?')
    Assert-True ($latestChangelog.Success) "$slug/CHANGELOG.md has no release heading."
    Assert-True ($latestChangelog.Groups['version'].Value -eq $scriptVersion) "$slug/CHANGELOG.md latest release does not match @version $scriptVersion."

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
    Write-Host "PASS $relativePath $scriptVersion"
}

foreach ($rootReadmeName in @('README.md', 'README.tr.md')) {
    $rootReadmePath = Join-Path $repoRoot $rootReadmeName
    $rootReadmeSource = [System.IO.File]::ReadAllText($rootReadmePath, [System.Text.Encoding]::UTF8)
    $packageReadmeName = if ($rootReadmeName -eq 'README.md') { 'README.en.md' } else { 'README.md' }
    foreach ($slug in $scriptVersions.Keys) {
        $scriptVersion = $scriptVersions[$slug]
        $pathPattern = [regex]::Escape("./scripts/$slug/$packageReadmeName")
        $versionPattern = [regex]::Escape($scriptVersion)
        $rowMatches = [regex]::Matches($rootReadmeSource, "(?m)^\|.*\($pathPattern\)\s*\|\s*$versionPattern\s*\|")
        Assert-True ($rowMatches.Count -eq 1) "$rootReadmeName must link $slug to $packageReadmeName exactly once at version $scriptVersion."
    }
}

$distributionPath = Join-Path $repoRoot 'DISTRIBUTION.md'
$distributionSource = [System.IO.File]::ReadAllText($distributionPath, [System.Text.Encoding]::UTF8)
Assert-True ([regex]::IsMatch($distributionSource, ('(?m)^Suite version:\s+`{0}`\s*$' -f [regex]::Escape($version)))) 'DISTRIBUTION.md suite version does not match VERSION.'
$releaseNotesPath = Join-Path $repoRoot "docs/releases/v$version.md"
Assert-True (Test-Path -LiteralPath $releaseNotesPath -PathType Leaf) "Release notes are missing: docs/releases/v$version.md"

$communityHealthPaths = [ordered]@{
    CodeOfConduct = Join-Path $repoRoot '.github/CODE_OF_CONDUCT.md'
    Contributing = Join-Path $repoRoot '.github/CONTRIBUTING.md'
    PullRequestTemplate = Join-Path $repoRoot '.github/PULL_REQUEST_TEMPLATE.md'
}
foreach ($entry in $communityHealthPaths.GetEnumerator()) {
    Assert-True (Test-Path -LiteralPath $entry.Value -PathType Leaf) "Community health file is missing: $($entry.Value.Substring($repoRoot.Length + 1))"
}
$codeOfConductSource = [System.IO.File]::ReadAllText($communityHealthPaths.CodeOfConduct, [System.Text.Encoding]::UTF8)
Assert-True ($codeOfConductSource.Contains('# Contributor Covenant Code of Conduct')) 'CODE_OF_CONDUCT.md must use the GitHub-recognized Contributor Covenant template.'
Assert-True ($codeOfConductSource.Contains('version 2.0')) 'CODE_OF_CONDUCT.md must retain the GitHub Contributor Covenant template attribution.'
Assert-True (-not $codeOfConductSource.Contains('[INSERT CONTACT METHOD]')) 'CODE_OF_CONDUCT.md still contains an unresolved contact placeholder.'
Assert-True ($codeOfConductSource.Contains('https://makaytron.com/contact')) 'CODE_OF_CONDUCT.md must provide the project conduct reporting path.'
Assert-True ($codeOfConductSource.Contains('https://support.github.com/contact/report-abuse')) 'CODE_OF_CONDUCT.md must retain the platform abuse escalation path.'

$contributingSource = [System.IO.File]::ReadAllText($communityHealthPaths.Contributing, [System.Text.Encoding]::UTF8)
Assert-True ($contributingSource.Contains("$canonicalRepo/issues/new/choose")) 'CONTRIBUTING.md must link the repository issue chooser.'
Assert-True ($contributingSource.Contains("$canonicalRepo/discussions/categories/q-a")) 'CONTRIBUTING.md must link the Q&A Discussions category.'
Assert-True ($contributingSource.Contains('tools/Test-Distribution.ps1')) 'CONTRIBUTING.md must document the full local distribution gate.'
Assert-True ($contributingSource.Contains('../SECURITY.md') -and $contributingSource.Contains('../SECURITY.en.md')) 'CONTRIBUTING.md must link both security policies.'

$pullRequestTemplateSource = [System.IO.File]::ReadAllText($communityHealthPaths.PullRequestTemplate, [System.Text.Encoding]::UTF8)
Assert-True ($pullRequestTemplateSource.Contains('## Summary /')) 'PULL_REQUEST_TEMPLATE.md must request a bilingual summary.'
Assert-True ($pullRequestTemplateSource.Contains('## Safety and privacy /')) 'PULL_REQUEST_TEMPLATE.md must include the safety and privacy review.'
Assert-True ($pullRequestTemplateSource.Contains('tools/Test-Distribution.ps1')) 'PULL_REQUEST_TEMPLATE.md must request the full distribution result.'

$issueConfigSource = [System.IO.File]::ReadAllText((Join-Path $repoRoot '.github/ISSUE_TEMPLATE/config.yml'), [System.Text.Encoding]::UTF8)
$supportSource = [System.IO.File]::ReadAllText((Join-Path $repoRoot 'SUPPORT.md'), [System.Text.Encoding]::UTF8)
$supportEnSource = [System.IO.File]::ReadAllText((Join-Path $repoRoot 'SUPPORT.en.md'), [System.Text.Encoding]::UTF8)
$qAndAUrl = "$canonicalRepo/discussions/categories/q-a"
$issueChooserUrl = "$canonicalRepo/issues/new/choose"
Assert-True ($issueConfigSource.Contains($qAndAUrl)) 'Issue chooser must route general usage questions to Q&A Discussions.'
Assert-True (-not $issueConfigSource.Contains("$canonicalRepo/blob/main/SUPPORT.md")) 'Issue chooser must not route general usage questions back to the support guide.'
Assert-True ($supportSource.Contains($qAndAUrl) -and $supportEnSource.Contains($qAndAUrl)) 'Both support guides must route general usage questions to Q&A Discussions.'
Assert-True ($supportSource.Contains($issueChooserUrl) -and $supportEnSource.Contains($issueChooserUrl)) 'Both support guides must route reproducible bugs to the issue chooser.'
Write-Host 'PASS community health files=3'

$updaterTestPath = Join-Path $repoRoot 'tools/Test-Updaters.mjs'
Assert-True (Test-Path -LiteralPath $updaterTestPath -PathType Leaf) 'Updater behavior test is missing.'
& node --test $updaterTestPath
Assert-True ($LASTEXITCODE -eq 0) 'Updater behavior tests failed.'

$listingAnalyzerTestPath = Join-Path $repoRoot 'tools/Test-Listing-Analyzer.mjs'
Assert-True (Test-Path -LiteralPath $listingAnalyzerTestPath -PathType Leaf) 'Listing Analyzer behavior test is missing.'
& node --test $listingAnalyzerTestPath
Assert-True ($LASTEXITCODE -eq 0) 'Listing Analyzer behavior tests failed.'

$saleManagerTestPath = Join-Path $repoRoot 'tools/Test-Sale-Manager.mjs'
Assert-True (Test-Path -LiteralPath $saleManagerTestPath -PathType Leaf) 'Sale Manager behavior test is missing.'
& node --test $saleManagerTestPath
Assert-True ($LASTEXITCODE -eq 0) 'Sale Manager behavior tests failed.'

$adsKeywordManagerTestPath = Join-Path $repoRoot 'tools/Test-Ads-Keyword-Manager.mjs'
Assert-True (Test-Path -LiteralPath $adsKeywordManagerTestPath -PathType Leaf) 'Ads Keyword Manager behavior test is missing.'
& node --test $adsKeywordManagerTestPath
Assert-True ($LASTEXITCODE -eq 0) 'Ads Keyword Manager behavior tests failed.'

$messageAssistantTestPath = Join-Path $repoRoot 'tools/Test-Message-Assistant.mjs'
Assert-True (Test-Path -LiteralPath $messageAssistantTestPath -PathType Leaf) 'Message Assistant behavior test is missing.'
& node --test $messageAssistantTestPath
Assert-True ($LASTEXITCODE -eq 0) 'Message Assistant behavior tests failed.'

$secretPatterns = @(
    ('-----BEGIN ' + '(?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
    ('github_' + 'pat_[A-Za-z0-9_]{20,}'),
    ('gh' + '[pousr]_[A-Za-z0-9]{20,}'),
    ('sb_' + 'secret_[A-Za-z0-9_-]{20,}'),
    ('xox' + '[baprs]-[A-Za-z0-9-]{20,}')
)
$textExtensions = @('.js', '.mjs', '.json', '.md', '.ps1', '.txt', '.yaml', '.yml')
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
        $communityProfileUrl = 'https://api.github.com/repos/Makaytron/Etsy-Automation-Tools/community/profile'
        $communityProfile = ConvertFrom-Json -InputObject (Get-HttpUtf8 -Client $httpClient -Url $communityProfileUrl)
        Assert-True ([int]$communityProfile.health_percentage -eq 100) "GitHub community health is not complete: $($communityProfile.health_percentage)%"
        Assert-True ($null -ne $communityProfile.files.code_of_conduct_file) 'GitHub did not recognize CODE_OF_CONDUCT.md.'
        Assert-True ($null -ne $communityProfile.files.contributing) 'GitHub did not recognize CONTRIBUTING.md.'
        Assert-True ($null -ne $communityProfile.files.pull_request_template) 'GitHub did not recognize PULL_REQUEST_TEMPLATE.md.'
        Write-Host 'REMOTE MATCH GitHub community health 100%'
    }
    finally {
        $httpClient.Dispose()
    }
}

if ($HostedChannels) {
    $hostedClient = [System.Net.Http.HttpClient]::new()
    $hostedClient.Timeout = [TimeSpan]::FromSeconds(45)
    $hostedClient.DefaultRequestHeaders.UserAgent.ParseAdd('Makaytron-distribution-validator')
    try {
        $apiBase = 'https://api.github.com/repos/Makaytron/Etsy-Automation-Tools'
        $standaloneRelease = -not [string]::IsNullOrWhiteSpace($PackageSlug)
        if ($standaloneRelease) {
            Assert-True ($scriptFilesBySlug.ContainsKey($PackageSlug)) "Unknown standalone package slug: $PackageSlug"
            $releaseVersion = [string]$scriptVersions[$PackageSlug]
            $releaseScripts = @($scripts | Where-Object { $_.Directory.Name -eq $PackageSlug })
            Assert-True ($releaseScripts.Count -eq 1) "Standalone package $PackageSlug must resolve to exactly one userscript."
            $releaseTag = "$PackageSlug-v$releaseVersion"
            $sourceForgeFolder = $releaseTag
        }
        else {
            $releaseVersion = $version
            $releaseScripts = $scripts
            $releaseTag = "v$version"
            $sourceForgeFolder = $releaseTag
        }
        $release = ConvertFrom-Json -InputObject (Get-HttpUtf8 -Client $hostedClient -Url "$apiBase/releases/tags/$releaseTag")
        Assert-True ([string]$release.tag_name -eq $releaseTag) "GitHub Release tag mismatch: $($release.tag_name)"
        Assert-True (-not [bool]$release.draft) "GitHub Release $releaseTag is still a draft."
        Assert-True (-not [bool]$release.prerelease) "GitHub Release $releaseTag is marked as a prerelease."

        $tagRef = ConvertFrom-Json -InputObject (Get-HttpUtf8 -Client $hostedClient -Url "$apiBase/git/ref/tags/$releaseTag")
        Assert-True ([string]$tagRef.object.type -eq 'tag') "GitHub tag $releaseTag is not annotated."
        $tagObject = ConvertFrom-Json -InputObject (Get-HttpUtf8 -Client $hostedClient -Url "$apiBase/git/tags/$($tagRef.object.sha)")
        Assert-True ([string]$tagObject.tag -eq $releaseTag) "GitHub annotated tag name mismatch for $releaseTag."
        Assert-True ([bool]$tagObject.verification.verified) "GitHub tag signature is not verified for $releaseTag."
        Assert-True ([string]$tagObject.object.type -eq 'commit') "GitHub tag $releaseTag does not point to a commit."
        $releaseCommitSha = [string]$tagObject.object.sha
        $releaseCommit = ConvertFrom-Json -InputObject (Get-HttpUtf8 -Client $hostedClient -Url "$apiBase/commits/$releaseCommitSha")
        Assert-True ([string]$releaseCommit.sha -eq $releaseCommitSha) "GitHub release commit mismatch for $releaseTag."
        Assert-True ([bool]$releaseCommit.commit.verification.verified) "GitHub release commit signature is not verified for $releaseTag."

        $localTagType = (& git -C $repoRoot cat-file -t $releaseTag).Trim()
        Assert-True ($LASTEXITCODE -eq 0 -and $localTagType -eq 'tag') "Local tag $releaseTag is missing or not annotated."
        $localReleaseCommit = (& git -C $repoRoot rev-list -n 1 $releaseTag).Trim()
        Assert-True ($LASTEXITCODE -eq 0 -and $localReleaseCommit -eq $releaseCommitSha) "Local and GitHub tag targets differ for $releaseTag."
        & git -C $repoRoot merge-base --is-ancestor $localReleaseCommit HEAD
        Assert-True ($LASTEXITCODE -eq 0) "Release commit $localReleaseCommit is not an ancestor of local HEAD."

        $latestRelease = ConvertFrom-Json -InputObject (Get-HttpUtf8 -Client $hostedClient -Url "$apiBase/releases/latest")
        $expectedLatestTag = if ($standaloneRelease -and $StandaloneLatest) { $releaseTag } else { "v$version" }
        Assert-True ([string]$latestRelease.tag_name -eq $expectedLatestTag) "Unexpected GitHub Latest release; expected $expectedLatestTag, found $($latestRelease.tag_name)."

        if ($standaloneRelease) {
            $expectedReleaseAssetNames = @($releaseScripts[0].Name, 'SHA256SUMS.txt')
        }
        else {
            $expectedReleaseAssetNames = @("Etsy-Automation-Tools-v$version.zip") +
                @($releaseScripts | ForEach-Object { $_.Name }) +
                @('SHA256SUMS.txt')
        }
        $releaseAssets = @($release.assets)
        $releaseAssetsByName = @{}
        $releaseAssetBytes = @{}
        $releaseAssetSha256 = @{}
        $releaseAssetMd5 = @{}
        foreach ($assetName in $expectedReleaseAssetNames) {
            $assetMatches = @($releaseAssets | Where-Object { [string]$_.name -eq $assetName })
            Assert-True ($assetMatches.Count -eq 1) "GitHub Release $releaseTag must contain $assetName exactly once."
            $asset = $assetMatches[0]
            Assert-True ([int64]$asset.size -gt 0) "GitHub Release asset is empty: $assetName"
            $bytes = Get-HttpBytes -Client $hostedClient -Url ([string]$asset.browser_download_url)
            Assert-True ($bytes.Length -eq [int64]$asset.size) "GitHub Release asset size mismatch: $assetName"
            $sha256 = Get-Sha256Hex -Bytes $bytes
            $md5 = Get-Md5Hex -Bytes $bytes
            if (-not [string]::IsNullOrWhiteSpace([string]$asset.digest)) {
                Assert-True ([string]$asset.digest -eq "sha256:$sha256") "GitHub Release asset digest mismatch: $assetName"
            }
            $releaseAssetsByName[$assetName] = $asset
            $releaseAssetBytes[$assetName] = $bytes
            $releaseAssetSha256[$assetName] = $sha256
            $releaseAssetMd5[$assetName] = $md5
        }
        $unexpectedReleaseAssets = @($releaseAssets | Where-Object { $expectedReleaseAssetNames -notcontains [string]$_.name })
        Assert-True ($unexpectedReleaseAssets.Count -eq 0) "GitHub Release has unexpected assets: $((@($unexpectedReleaseAssets | ForEach-Object { $_.name }) -join ', '))"

        $manifestText = ([System.Text.UTF8Encoding]::new($false)).GetString([byte[]]$releaseAssetBytes['SHA256SUMS.txt'])
        $manifestEntries = @{}
        foreach ($line in @($manifestText.Replace("`r`n", "`n").Replace("`r", "`n") -split "`n")) {
            if ([string]::IsNullOrWhiteSpace($line)) { continue }
            $manifestMatch = [regex]::Match($line, '^(?<hash>[0-9a-f]{64})  (?<name>[^/\\\r\n]+)$', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
            Assert-True ($manifestMatch.Success) "Invalid SHA256SUMS.txt line: $line"
            $manifestName = $manifestMatch.Groups['name'].Value
            Assert-True (-not $manifestEntries.ContainsKey($manifestName)) "Duplicate SHA256SUMS.txt entry: $manifestName"
            $manifestEntries[$manifestName] = $manifestMatch.Groups['hash'].Value.ToLowerInvariant()
        }
        $expectedManifestNames = @($expectedReleaseAssetNames | Where-Object { $_ -ne 'SHA256SUMS.txt' })
        Assert-True ($manifestEntries.Count -eq $expectedManifestNames.Count) 'SHA256SUMS.txt has an unexpected number of entries.'
        foreach ($assetName in $expectedManifestNames) {
            Assert-True ($manifestEntries.ContainsKey($assetName)) "SHA256SUMS.txt is missing $assetName."
            Assert-True ($manifestEntries[$assetName] -eq $releaseAssetSha256[$assetName]) "SHA256SUMS.txt mismatch for $assetName."
        }
        foreach ($script in $releaseScripts) {
            $localHash = Get-Sha256Hex -Bytes ([System.IO.File]::ReadAllBytes($script.FullName))
            Assert-True ($localHash -eq $releaseAssetSha256[$script.Name]) "GitHub Release userscript differs from local source: $($script.Name)"
            $relativePath = $script.FullName.Substring($repoRoot.Length + 1).Replace('\', '/')
            $taggedSourceUrl = "https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/$releaseCommitSha/$relativePath"
            $taggedHash = Get-Sha256Hex -Bytes (Get-HttpBytes -Client $hostedClient -Url $taggedSourceUrl)
            Assert-True ($taggedHash -eq $releaseAssetSha256[$script.Name]) "GitHub Release userscript differs from the signed tag source: $($script.Name)"
        }
        Write-Host "HOSTED MATCH GitHub Release $releaseTag assets=$($expectedReleaseAssetNames.Count) commit=$releaseCommitSha"

        $greasyForkListings = @(
            [pscustomobject]@{ Id = 589843; Slug = 'etsy-sale-campaign-batch-runner' },
            [pscustomobject]@{ Id = 589844; Slug = 'etsy-message-assistant' },
            [pscustomobject]@{ Id = 589845; Slug = 'etsy-ads-keyword-manager' },
            [pscustomobject]@{ Id = 589846; Slug = 'etsy-listing-analyzer' },
            [pscustomobject]@{ Id = 589847; Slug = 'etsy-keyword-market-analyzer' }
        )
        foreach ($listing in $greasyForkListings) {
            Assert-True ($scriptFilesBySlug.ContainsKey($listing.Slug)) "Greasy Fork mapping references an unknown package: $($listing.Slug)"
            $nonce = [DateTime]::UtcNow.Ticks
            $metaUrl = "https://update.greasyfork.org/scripts/$($listing.Id)/metadata.meta.js?verify=$nonce"
            $codeUrl = "https://update.greasyfork.org/scripts/$($listing.Id)/script.user.js?verify=$nonce"
            $remoteMeta = Get-HttpUtf8 -Client $hostedClient -Url $metaUrl
            $remoteCode = Get-HttpUtf8 -Client $hostedClient -Url $codeUrl
            $localSource = [System.IO.File]::ReadAllText($scriptFilesBySlug[$listing.Slug], [System.Text.Encoding]::UTF8)
            $expectedName = @(Metadata-Values -Source $localSource -Key 'name')
            $metaName = @(Metadata-Values -Source $remoteMeta -Key 'name')
            $codeName = @(Metadata-Values -Source $remoteCode -Key 'name')
            $metaVersion = @(Metadata-Values -Source $remoteMeta -Key 'version')
            $codeVersion = @(Metadata-Values -Source $remoteCode -Key 'version')
            $codeUpdateUrl = @(Metadata-Values -Source $remoteCode -Key 'updateURL')
            $codeDownloadUrl = @(Metadata-Values -Source $remoteCode -Key 'downloadURL')
            Assert-True ($expectedName.Count -eq 1) "Local userscript has an invalid @name: $($listing.Slug)"
            Assert-True ($metaName.Count -eq 1 -and $metaName[0] -eq $expectedName[0]) "Greasy Fork metadata @name mismatch for $($listing.Slug)."
            Assert-True ($codeName.Count -eq 1 -and $codeName[0] -eq $expectedName[0]) "Greasy Fork code @name mismatch for $($listing.Slug)."
            Assert-True ($metaVersion.Count -eq 1 -and $metaVersion[0] -eq $scriptVersions[$listing.Slug]) "Greasy Fork metadata version mismatch for $($listing.Slug)."
            Assert-True ($codeVersion.Count -eq 1 -and $codeVersion[0] -eq $scriptVersions[$listing.Slug]) "Greasy Fork code version mismatch for $($listing.Slug)."
            Assert-True ($codeUpdateUrl.Count -eq 1) "Greasy Fork code must contain exactly one @updateURL for $($listing.Slug)."
            Assert-True ($codeDownloadUrl.Count -eq 1) "Greasy Fork code must contain exactly one @downloadURL for $($listing.Slug)."
            Assert-GreasyForkHostedUrl -Url $codeUpdateUrl[0] -ScriptId $listing.Id -Suffix '.meta.js' -Label "@updateURL for $($listing.Slug)"
            Assert-GreasyForkHostedUrl -Url $codeDownloadUrl[0] -ScriptId $listing.Id -Suffix '.user.js' -Label "@downloadURL for $($listing.Slug)"
            $normalizedRemote = Normalize-HostedUserscript -Source $remoteCode
            $normalizedLocal = Normalize-HostedUserscript -Source $localSource
            Assert-True ([string]::Equals($normalizedRemote, $normalizedLocal, [System.StringComparison]::Ordinal)) "Greasy Fork code parity mismatch for $($listing.Slug)."
            Write-Host "HOSTED MATCH Greasy Fork $($listing.Id) $($listing.Slug) $($scriptVersions[$listing.Slug])"
        }

        $sourceForgePath = [uri]::EscapeDataString("/$sourceForgeFolder")
        $sourceForgeUrl = "https://sourceforge.net/projects/etsy-automation-tools/rss?path=$sourceForgePath&verify=$([DateTime]::UtcNow.Ticks)"
        $sourceForgeResponse = Invoke-WebRequest -Uri $sourceForgeUrl -UseBasicParsing -TimeoutSec 45 -Headers @{
            'User-Agent' = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/127.0 Safari/537.36'
            'Accept' = 'application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.8'
        }
        Assert-True ([int]$sourceForgeResponse.StatusCode -eq 200) "SourceForge RSS returned HTTP $($sourceForgeResponse.StatusCode)."
        if ($sourceForgeResponse.Content -is [byte[]]) {
            $sourceForgeXmlText = ([System.Text.UTF8Encoding]::new($false)).GetString([byte[]]$sourceForgeResponse.Content)
        }
        else {
            $sourceForgeXmlText = [string]$sourceForgeResponse.Content
        }
        [xml]$sourceForgeXml = $sourceForgeXmlText
        $sourceForgeAssets = @(
            foreach ($item in @($sourceForgeXml.rss.channel.item)) {
                $titleNode = $item.SelectSingleNode('title')
                $mediaNode = $item.SelectSingleNode("*[local-name()='content']")
                if ($null -eq $titleNode -or $null -eq $mediaNode) { continue }
                $title = [string]$titleNode.InnerText
                $name = [uri]::UnescapeDataString(($title -replace '^.*/', ''))
                $hashNode = $mediaNode.SelectSingleNode("*[local-name()='hash']")
                [pscustomobject]@{
                    Name = $name
                    Size = [int64]$mediaNode.GetAttribute('filesize')
                    Md5 = if ($null -ne $hashNode -and [string]$hashNode.GetAttribute('algo') -eq 'md5') { [string]$hashNode.InnerText } else { '' }
                }
            }
        )
        foreach ($assetName in $expectedReleaseAssetNames) {
            $sourceForgeMatches = @($sourceForgeAssets | Where-Object { $_.Name -eq $assetName })
            Assert-True ($sourceForgeMatches.Count -eq 1) "SourceForge $sourceForgeFolder must contain $assetName exactly once; sync incomplete, rerun the hosted validation."
            $sourceForgeAsset = $sourceForgeMatches[0]
            Assert-True ($sourceForgeAsset.Size -eq [int64]$releaseAssetsByName[$assetName].size) "SourceForge size mismatch for $assetName."
            Assert-True (-not [string]::IsNullOrWhiteSpace($sourceForgeAsset.Md5)) "SourceForge RSS has no MD5 for $assetName."
            Assert-True ($sourceForgeAsset.Md5.ToLowerInvariant() -eq $releaseAssetMd5[$assetName]) "SourceForge content digest mismatch for $assetName."
        }
        $sourceForgeExtras = @($sourceForgeAssets | Where-Object { $expectedReleaseAssetNames -notcontains $_.Name })
        Write-Host "HOSTED MATCH SourceForge $sourceForgeFolder assets=$($expectedReleaseAssetNames.Count) extras=$($sourceForgeExtras.Count)"

        $sourceForgeLatestUrl = 'https://sourceforge.net/projects/etsy-automation-tools/files/latest/download'
        $expectedLatestPath = "/project/etsy-automation-tools/v$version/Etsy-Automation-Tools-v$version.zip"
        $sourceForgePlatformAgents = [ordered]@{
            windows = 'curl/8.10.1 (Windows NT 10.0)'
            mac = 'curl/8.10.1 (Macintosh; Intel Mac OS X 10_15_7)'
            linux = 'curl/8.10.1 (X11; Linux x86_64)'
            other = 'curl/8.10.1'
        }
        $redirectHandler = [System.Net.Http.HttpClientHandler]::new()
        $redirectHandler.AllowAutoRedirect = $false
        $redirectClient = [System.Net.Http.HttpClient]::new($redirectHandler)
        $redirectClient.Timeout = [TimeSpan]::FromSeconds(45)
        try {
            foreach ($platform in $sourceForgePlatformAgents.Keys) {
                $request = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::Head, $sourceForgeLatestUrl)
                $request.Headers.TryAddWithoutValidation('User-Agent', [string]$sourceForgePlatformAgents[$platform]) | Out-Null
                $request.Headers.TryAddWithoutValidation('Cache-Control', 'no-cache') | Out-Null
                try {
                    $response = $redirectClient.SendAsync($request).GetAwaiter().GetResult()
                    try {
                        Assert-True ([int]$response.StatusCode -in @(301, 302, 303, 307, 308)) "SourceForge latest/download did not redirect for $platform; HTTP $([int]$response.StatusCode)."
                        Assert-True ($null -ne $response.Headers.Location) "SourceForge latest/download omitted the redirect target for $platform."
                        $downloadUri = if ($response.Headers.Location.IsAbsoluteUri) {
                            $response.Headers.Location
                        }
                        else {
                            [uri]::new([uri]$sourceForgeLatestUrl, $response.Headers.Location)
                        }
                        Assert-True ([string]$downloadUri.Host -eq 'downloads.sourceforge.net') "SourceForge latest/download host drift for ${platform}: $($downloadUri.Host)"
                        Assert-True ([uri]::UnescapeDataString($downloadUri.AbsolutePath) -eq $expectedLatestPath) "SourceForge default download mismatch for $platform; expected $expectedLatestPath, found $($downloadUri.AbsolutePath)."
                    }
                    finally {
                        $response.Dispose()
                    }
                }
                finally {
                    $request.Dispose()
                }
            }
        }
        finally {
            $redirectClient.Dispose()
        }
        Write-Host "HOSTED MATCH SourceForge default $expectedLatestPath platforms=windows,mac,linux,other"

        try {
            $zoneUrl = 'https://www.userscript.zone/search?q=Makaytron&source=search&start=0'
            $zoneResponse = Invoke-WebRequest -Uri $zoneUrl -UseBasicParsing -TimeoutSec 30 -Headers @{ 'User-Agent' = 'Mozilla/5.0 Makaytron-distribution-validator' }
            $zoneText = [System.Net.WebUtility]::HtmlDecode(([regex]::Replace([string]$zoneResponse.Content, '<[^>]+>', ' ')))
            $zoneText = [regex]::Replace($zoneText, '\s+', ' ')
            $zoneCountMatch = [regex]::Match($zoneText, '(?<count>\d+)\s+results?\s*\(', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
            if (-not $zoneCountMatch.Success -or [int]$zoneCountMatch.Groups['count'].Value -eq 0) {
                Write-Warning -WarningAction Continue -Message 'Userscript.Zone has not indexed the Makaytron listings yet; this passive crawler has no upload or webhook API.'
            }
            else {
                $missingZoneListings = [System.Collections.Generic.List[string]]::new()
                foreach ($listing in $greasyForkListings) {
                    $localSource = [System.IO.File]::ReadAllText($scriptFilesBySlug[$listing.Slug], [System.Text.Encoding]::UTF8)
                    $expectedName = @(Metadata-Values -Source $localSource -Key 'name')[0]
                    if ($zoneText.IndexOf($expectedName, [System.StringComparison]::OrdinalIgnoreCase) -lt 0 -or
                        $zoneText.IndexOf($scriptVersions[$listing.Slug], [System.StringComparison]::OrdinalIgnoreCase) -lt 0) {
                        $missingZoneListings.Add("$expectedName $($scriptVersions[$listing.Slug])")
                    }
                }
                if ($missingZoneListings.Count -gt 0) {
                    Write-Warning -WarningAction Continue -Message "Userscript.Zone index is incomplete or stale: $($missingZoneListings -join '; ')"
                }
                else {
                    Write-Host 'HOSTED MATCH Userscript.Zone 5 listings (advisory channel)'
                }
            }
        }
        catch {
            Write-Warning -WarningAction Continue -Message "Userscript.Zone advisory check could not run: $($_.Exception.Message)"
        }

        try {
            $openUserJsIssues = @(@(2102, 1705) | ForEach-Object {
                ConvertFrom-Json -InputObject (Get-HttpUtf8 -Client $hostedClient -Url "https://api.github.com/repos/OpenUserJS/OpenUserJS.org/issues/$_")
            })
            if (@($openUserJsIssues | Where-Object { $_.state -ne 'open' }).Count -gt 0) {
                Write-Warning -WarningAction Continue -Message 'OpenUserJS blocker status changed; reassess the inactive distribution policy manually.'
            }
            else {
                Write-Host 'HOSTED INACTIVE OpenUserJS blockers #2102 and #1705 remain open'
            }
        }
        catch {
            Write-Warning -WarningAction Continue -Message "OpenUserJS advisory check could not run: $($_.Exception.Message)"
        }
    }
    finally {
        $hostedClient.Dispose()
    }
}

$versionSummary = @(
    $scriptVersions.GetEnumerator() |
        Sort-Object Name |
        ForEach-Object { "$($_.Name)=$($_.Value)" }
) -join ', '
Write-Host "Distribution validation passed for suite $version. Script versions: $versionSummary"
