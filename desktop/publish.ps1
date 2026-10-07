param(
    [string]$Notes = "Automatic update with bug fixes and improvements.",
    [string]$Password = ""
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    $env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
}

$keyDir = Join-Path $env:USERPROFILE ".tauri"
$keyPath = Join-Path $keyDir "anontweet.key"
if (-not (Test-Path $keyPath)) { throw "Missing signing key: $keyPath" }
if (-not $Password) {
    # `-Raw` returns $null, not "", for a zero-byte file, so calling `.Trim()`
    # straight on it throws "You cannot call a method on a null-valued
    # expression". Note that `[string]$null` is still $null in PowerShell — it
    # does not coerce — so the explicit check is what actually fixes this, and
    # string interpolation is used for the non-empty branch because `.Trim()` is
    # safe on a real string. An empty TAURI_SIGNING_PRIVATE_KEY_PASSWORD is
    # correct for an unencrypted key; passing "" to a key that does need one
    # fails loudly at signing time rather than silently signing with the wrong
    # secret.
    $passFile = Get-Content (Join-Path $keyDir "anontweet.pass") -Raw
    if ($null -eq $passFile) { $Password = "" } else { $Password = $passFile.Trim() }
}

# Guard against the unanswerable prompt. An encrypted secret key with no
# password makes `tauri build` fall back to reading the password from stdin. This
# script runs from release.ps1 with no TTY attached, so it cannot answer: it sits
# at "Password:" until something kills it. Detect that combination here, before
# the ~11 minute compile, and say what to fix instead. An encrypted key is
# identified by its wrapped comment line, which rsign labels "rsign encrypted
# secret key"; an unencrypted one omits the word.
$keyIsEncrypted = ([System.Text.Encoding]::UTF8.GetString(
    [System.Convert]::FromBase64String((Get-Content $keyPath -Raw).Trim())) -split "`n")[0] -match 'encrypted'
if ($keyIsEncrypted -and -not $Password) {
    throw @"
Signing key at $keyPath is encrypted, but no password was supplied, so
`tauri build` would stop at an interactive "Password:" prompt that this script
cannot answer (stdin is not a TTY).

Fix: write the password to $(Join-Path $keyDir "anontweet.pass"), or pass it
with:  .\release.ps1 -Password <password>
"@
}

# Preflight: fail in seconds if the private key on this machine is not the key
# the app trusts. tauri build only discovers a mismatch *after* ~11 minutes of
# Rust compilation, and it cannot derive the public key from an encrypted secret
# key without the password, so the mismatch surfaces as a password prompt that
# release.ps1 cannot answer (stdin is not a TTY). `tauri signer generate` always
# writes anontweet.key.pub next to anontweet.key, so comparing that against the
# pubkey embedded in tauri.conf.json catches both a wrong key and a stale key
# before any work happens.
function Get-MinisignKeyId([string]$raw) {
    # tauri wraps the whole key file in base64 with escaped newlines.
    $unwrapped = [System.Text.Encoding]::UTF8.GetString(
        [System.Convert]::FromBase64String(($raw.Trim() -replace '\\n', "`n")))
    $blob = [System.Convert]::FromBase64String((($unwrapped -split "`n")[1]).Trim())
    # layout is "Ed" (2 bytes) + key id (8 bytes) + public key (32 bytes)
    return (($blob[2..9] | ForEach-Object { $_.ToString("X2") }) -join "")
}

$pubKeyPath = Join-Path $keyDir "anontweet.key.pub"
if (-not (Test-Path $pubKeyPath)) {
    throw "Missing public key: $pubKeyPath (tauri signer generate writes it alongside the secret key)"
}
$committedPubkey = (Get-Content (Join-Path $PSScriptRoot "src-tauri/tauri.conf.json") -Raw |
    ConvertFrom-Json).plugins.updater.pubkey
$expectedId = Get-MinisignKeyId $committedPubkey
$actualId = Get-MinisignKeyId (Get-Content $pubKeyPath -Raw)
if ($expectedId -ne $actualId) {
    throw @"
Updater signing key mismatch:
  tauri.conf.json embeds : $expectedId
  $pubKeyPath : $actualId
The app on every user's machine trusts $expectedId, so artifacts signed with
$actualId are silently rejected and auto-update will never fire.
Get the private key matching $expectedId from the TAURI_SIGNING_PRIVATE_KEY
repository secret before releasing. Refusing to build.
"@
}

$env:TAURI_SIGNING_PRIVATE_KEY = (Get-Content $keyPath -Raw).Trim()
# PowerShell *removes* a variable when it is assigned "" rather than setting it
# to an empty string, so assigning unconditionally deleted
# TAURI_SIGNING_PRIVATE_KEY_PASSWORD for an unencrypted key. tauri build then saw
# no password in the environment, fell back to an interactive prompt, and failed
# with "incorrect updater private key password: Wrong password for that key" even
# though the empty password was correct. Only define the variable when there is
# a password; clear it when there is not.
if ($Password) { $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $Password }
else { Remove-Item Env:\TAURI_SIGNING_PRIVATE_KEY_PASSWORD -ErrorAction SilentlyContinue }

Write-Host "Staging the bundled web app (standalone Next build + Node runtime)..."
# The installer now carries the whole Next server plus a Node runtime that serve the
# UI from 127.0.0.1, so those have to exist before tauri build reads them out of
# bundle.resources. They are gitignored, so a fresh clone cannot skip this.
$RepoRoot = (Resolve-Path "..").Path
Push-Location $RepoRoot
try {
    node tools/prepare-desktop.mjs
    if ($LASTEXITCODE -ne 0) { throw "tools/prepare-desktop.mjs failed" }
}
finally { Pop-Location }

Write-Host "Building signed Tauri bundles..."
npx tauri build
if ($LASTEXITCODE -ne 0) { throw "tauri build failed" }

$conf = Get-Content "src-tauri/tauri.conf.json" -Raw | ConvertFrom-Json
$version = $conf.version

$releaseDir = Join-Path (Resolve-Path "src-tauri") "target/release/bundle"
$outDir = Join-Path (Resolve-Path "..") "public/downloads/desktop"
$manifestPath = Join-Path $outDir "latest.json"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$setup = Get-ChildItem (Join-Path $releaseDir "nsis") -Filter "*x64-setup.exe" |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $setup) { throw "NSIS setup artifact not found" }
$sig = "$($setup.FullName).sig"
if (-not (Test-Path $sig)) { throw "Missing signature file: $sig" }

$msi = Get-ChildItem (Join-Path $releaseDir "msi") -Filter "*.msi" |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1

# Remove stale artifacts from *other* versions, keeping any of the current
# version (Linux/macOS bundles published by CI for this version stay intact).
Get-ChildItem $outDir -Filter "AnonTweet_*" -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -notmatch [regex]::Escape($version) } |
    Remove-Item -Force

Copy-Item $setup.FullName (Join-Path $outDir $setup.Name) -Force
Copy-Item $sig (Join-Path $outDir "$($setup.Name).sig") -Force
if ($msi) {
    Copy-Item $msi.FullName (Join-Path $outDir $msi.Name) -Force
    if (Test-Path "$($msi.FullName).sig") {
        Copy-Item "$($msi.FullName).sig" (Join-Path $outDir "$($msi.Name).sig") -Force
    }
}

$signature = (Get-Content $sig -Raw).Trim()
$pubDate = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")

# Merge into the existing manifest instead of overwriting it, so platform
# entries published by CI for this version (linux-x86_64, darwin-*) survive.
# $manifestPath is resolved above, next to $outDir, because it is read here.
$existing = $null
if (Test-Path $manifestPath) {
    try { $existing = Get-Content $manifestPath -Raw | ConvertFrom-Json } catch {}
}
$platforms = @{}
if ($existing -and $existing.platforms) {
    foreach ($p in $existing.platforms.PSObject.Properties) {
        if ($p.Name -ne "windows-x86_64") { $platforms[$p.Name] = $p.Value }
    }
}
$platforms["windows-x86_64"] = @{
    signature = $signature
    url       = "https://anontweet.vercel.app/downloads/desktop/$($setup.Name)"
}

$manifest = @{
    version   = $version
    notes     = $Notes
    pub_date  = $pubDate
    platforms = $platforms
}

[System.IO.File]::WriteAllText(
    $manifestPath,
    ($manifest | ConvertTo-Json -Depth 5),
    (New-Object System.Text.UTF8Encoding($false))
)

# The prune above deletes every installer belonging to another version, which leaves
# the download page's available.json advertising files that no longer exist, so
# /download 404s. Regenerate it from what is actually on disk. CI's merge step writes
# this file too, but only when it runs, which is not the local Windows release path.
Push-Location $RepoRoot
try {
    node tools/gen-available-json.mjs
    if ($LASTEXITCODE -ne 0) { throw "tools/gen-available-json.mjs failed" }
}
finally { Pop-Location }

Write-Host "Published to $outDir :"
Get-ChildItem $outDir | ForEach-Object { Write-Host "  $($_.Name) ($([math]::Round($_.Length/1KB)) KB)" }