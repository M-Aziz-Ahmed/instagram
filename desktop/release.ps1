param(
    [string]$Notes = "Automatic update with bug fixes and improvements.",
    [string]$Password = "",
    [string]$Version = "",
    [switch]$SkipDesktop,
    [switch]$NoCommit
)

# Single-command release pipeline:
#   1. Optionally bump the desktop version (Tauri updater only fires on version increase).
#   2. Build signed Tauri bundles + latest.json via publish.ps1.
#   3. Commit all changes (web UI + desktop artifacts) and push to origin/master,
#      which triggers the Vercel redeploy that serves the new update.
#
# Usage (from repo root or desktop/):
#   ./release.ps1                  # full pipeline
#   ./release.ps1 -Notes "fixed notifications on desktop"
#   ./release.ps1 -SkipDesktop     # deploy web-only changes (no bundle rebuild)
#   ./release.ps1 -NoCommit        # build/publish only, don't commit or push

$ErrorActionPreference = "Stop"

# --- Locate repo root + desktop dir ---------------------------------------
$RepoRoot = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $RepoRoot "package.json")) -or
    -not (Test-Path (Join-Path $RepoRoot "desktop/src-tauri"))) {
    throw "release.ps1 must live in the repo's desktop/ folder"
}
$DesktopDir = $PSScriptRoot
$ConfPath   = Join-Path $DesktopDir "src-tauri/tauri.conf.json"

# --- 1) Prompt for / bump desktop version ----------------------------------
$conf = Get-Content $ConfPath -Raw | ConvertFrom-Json
$current = $conf.version
Write-Host ""
Write-Host "Current desktop version: $current" -ForegroundColor Cyan

$newVersion = $Version.Trim()
if (-not $newVersion) {
    if ($Host.Name -ne "ConsoleHost" -or [Environment]::UserInteractive -eq $false) {
        throw "No version supplied and script is non-interactive. Pass -Version X.Y.Z"
    }
    $newVersion = (Read-Host "New desktop version (blank to keep $current)").Trim()
}
if ($newVersion -and $newVersion -ne $current) {
    if ($newVersion -notmatch '^\d+\.\d+\.\d+$') {
        throw "Version must be in the form X.Y.Z (e.g. 0.1.1)"
    }
    # Do a text-only replacement of the "version": "X.Y.Z" value. This avoids
    # reformatting the file and avoids writing a UTF-8 BOM (which breaks
    # Tauri's JSON parser at line 1).
    $raw = Get-Content $ConfPath -Raw
    $newRaw = $raw -replace '("version"\s*:\s*")[^"]*(")', "`${1}$newVersion`${2}"
    if ($newRaw -eq $raw) { throw "Could not locate the version field in $ConfPath" }
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($ConfPath, $newRaw, $utf8NoBom)
    # Sanity-check it still parses.
    $check = Get-Content $ConfPath -Raw | ConvertFrom-Json
    if ($check.version -ne $newVersion) { throw "Version bump did not stick (got $($check.version))" }
    Write-Host "Bumped version to $newVersion" -ForegroundColor Green
}

# --- 2) Publish signed desktop bundles -------------------------------------
if (-not $SkipDesktop) {
    Write-Host ""
    Write-Host "==> Building and publishing desktop bundles..." -ForegroundColor Cyan
    pushd $DesktopDir
    try {
        & .\publish.ps1 -Notes $Notes -Password $Password
        if ($LASTEXITCODE -ne 0) { throw "publish.ps1 failed" }
    }
    finally { popd }
} else {
    Write-Host ""
    Write-Host "==> Skipping desktop bundle build (-SkipDesktop)" -ForegroundColor Yellow
}

# --- 3) Commit + push ------------------------------------------------------
if ($NoCommit) {
    Write-Host ""
    Write-Host "Done. NOT committing/pushing (-NoCommit)." -ForegroundColor Yellow
    Write-Host "Review changes with: git status && git diff --stat"
    exit 0
}

Write-Host ""
Write-Host "==> Committing and pushing to origin/master..." -ForegroundColor Cyan

git -C $RepoRoot add -A
if ($LASTEXITCODE -ne 0) { throw "git add failed" }

$gitNotes = if ($newVersion -and $newVersion -ne $current) { "release v$newVersion" } else { "ui" }
if ($Notes -and $Notes -ne "Automatic update with bug fixes and improvements.") {
    $gitNotes = "$gitNotes - $Notes"
}
$gitNotes = $gitNotes.Trim()

git -C $RepoRoot commit -m $gitNotes
if ($LASTEXITCODE -ne 0) { throw "git commit failed" }

git -C $RepoRoot push origin master
if ($LASTEXITCODE -ne 0) { throw "git push failed" }

Write-Host ""
Write-Host "Released $gitNotes . Vercel will rebuild and serve the update." -ForegroundColor Green
Write-Host "Existing desktop users pick it up on next launch."
