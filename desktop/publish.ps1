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
if (-not $Password) { $Password = (Get-Content (Join-Path $keyDir "anontweet.pass") -Raw).Trim() }

$env:TAURI_SIGNING_PRIVATE_KEY = (Get-Content $keyPath -Raw).Trim()
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $Password

Write-Host "Building signed Tauri bundles..."
npx tauri build
if ($LASTEXITCODE -ne 0) { throw "tauri build failed" }

$conf = Get-Content "src-tauri/tauri.conf.json" -Raw | ConvertFrom-Json
$version = $conf.version

$releaseDir = Join-Path (Resolve-Path "src-tauri") "target/release/bundle"
$outDir = Join-Path (Resolve-Path "..") "public/downloads/desktop"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$setup = Get-ChildItem (Join-Path $releaseDir "nsis") -Filter "*x64-setup.exe" |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $setup) { throw "NSIS setup artifact not found" }
$sig = "$($setup.FullName).sig"
if (-not (Test-Path $sig)) { throw "Missing signature file: $sig" }

$msi = Get-ChildItem (Join-Path $releaseDir "msi") -Filter "*.msi" |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1

# Remove stale artifacts from previous versions so only the current one is served.
Get-ChildItem $outDir -Filter "AnonTweet_*" -ErrorAction SilentlyContinue | Remove-Item -Force

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

$manifest = @{
    version   = $version
    notes     = $Notes
    pub_date  = $pubDate
    platforms = @{
        "windows-x86_64" = @{
            signature = $signature
            url       = "https://anontweet.vercel.app/downloads/desktop/$($setup.Name)"
        }
    }
}

$manifestPath = Join-Path $outDir "latest.json"
[System.IO.File]::WriteAllText(
    $manifestPath,
    ($manifest | ConvertTo-Json -Depth 5),
    (New-Object System.Text.UTF8Encoding($false))
)

Write-Host "Published to $outDir :"
Get-ChildItem $outDir | ForEach-Object { Write-Host "  $($_.Name) ($([math]::Round($_.Length/1KB)) KB)" }