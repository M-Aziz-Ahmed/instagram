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
#      If the CI workflow already auto-committed Linux/macOS bundles to remote
#      (non-fast-forward), the push is retried after merging remote with
#      "-X ours" so this (newer) release wins latest.json/available.json.
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
$CargoPath  = Join-Path $DesktopDir "src-tauri/Cargo.toml"

# --- 1) Prompt for / bump desktop version ----------------------------------
$conf = Get-Content $ConfPath -Raw | ConvertFrom-Json
# The updater compares against the version in Cargo.toml, so read the real one
# from there (tauri.conf.json mirrors it for the bundle/manifest).
$cargoVer = (Select-String -Path $CargoPath -Pattern '^version = "(.*)"').Matches[0].Groups[1].Value
if ($conf.version -ne $cargoVer) { $currentVer = $cargoVer } else { $currentVer = $conf.version }
Write-Host ""
Write-Host "Current desktop version: $currentVer (conf: $($conf.version), cargo: $cargoVer)" -ForegroundColor Cyan

$newVersion = $Version.Trim()
if (-not $newVersion) {
    if ($Host.Name -ne "ConsoleHost" -or [Environment]::UserInteractive -eq $false) {
        throw "No version supplied and script is non-interactive. Pass -Version X.Y.Z"
    }
    $newVersion = (Read-Host "New desktop version (blank to keep $currentVer)").Trim()
}
if ($newVersion -and $newVersion -ne $currentVer) {
    if ($newVersion -notmatch '^\d+\.\d+\.\d+$') {
        throw "Version must be in the form X.Y.Z (e.g. 0.1.3)"
    }
    # Bump tauri.conf.json — text-only replacement so we avoid reformatting and
    # writing a UTF-8 BOM (which breaks Tauri's JSON parser at line 1).
    $raw = Get-Content $ConfPath -Raw
    $newRaw = $raw -replace '("version"\s*:\s*")[^"]*(")', "`${1}$newVersion`${2}"
    if ($newRaw -eq $raw) { throw "Could not locate the version field in $ConfPath" }
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($ConfPath, $newRaw, $utf8NoBom)
    $check = Get-Content $ConfPath -Raw | ConvertFrom-Json
    if ($check.version -ne $newVersion) { throw "Version bump did not stick (got $($check.version))" }

    # Bump Cargo.toml too — Tauri reads the app version from here, and the
    # updater compares the server version against it. Match only the package
    # `version = "..."` line (line-anchored so `rust-version` is left alone).
    $cargoRaw = Get-Content $CargoPath -Raw
    $cargoNew = $cargoRaw -replace '(?m)^version = ".*?"', "version = `"$newVersion`""
    if ($cargoNew -eq $cargoRaw) { throw "Could not locate the version field in $CargoPath" }
    [System.IO.File]::WriteAllText($CargoPath, $cargoNew, $utf8NoBom)
    $cargoCheck = (Select-String -Path $CargoPath -Pattern '^version = "(.*)"').Matches[0].Groups[1].Value
    if ($cargoCheck -ne $newVersion) { throw "Cargo.toml version bump did not stick (got $cargoCheck)" }

    Write-Host "Bumped version to $newVersion (tauri.conf.json + Cargo.toml)" -ForegroundColor Green
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

# The desktop CI workflow auto-commits the Linux/macOS bundles to origin/master
# right after our previous push, so a fast-forward push routinely races it.
# Instead of failing, integrate the remote commit (preferring OUR side of any
# latest.json/available.json conflict — this release is newer) and retry.
$pushed = $false
for ($attempt = 1; $attempt -le 3 -and -not $pushed; $attempt++) {
    git -C $RepoRoot push origin master
    if ($LASTEXITCODE -eq 0) { $pushed = $true; break }

    Write-Host "Push rejected (CI commit landed on remote). Integrating remote then retrying..." -ForegroundColor Yellow
    git -C $RepoRoot fetch origin
    if ($LASTEXITCODE -ne 0) { throw "git fetch failed" }

    git -C $RepoRoot merge --no-edit -X ours origin/master
    if ($LASTEXITCODE -ne 0) { throw "Could not integrate origin/master (merge failed)" }
}
if (-not $pushed) { throw "git push failed after integrating remote 3 times" }

Write-Host ""
Write-Host "Released $gitNotes . Vercel will rebuild and serve the update." -ForegroundColor Green
Write-Host "Existing desktop users pick it up on next launch."
