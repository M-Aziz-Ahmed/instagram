#!/usr/bin/env python3
"""Publish per-platform Tauri build artifacts for direct download.

Tauri writes one latest.json per build (each containing only the platforms that
build produced, e.g. linux-x86_64 or darwin-aarch64). This tool:

  1. copies every artifact (Windows/Linux/macOS, signed or not) found in the
     search directories into public/downloads/desktop, pruning files of other
     versions, so the download page has real installers for every platform;
  2. writes available.json (version + per-platform file list) which the web UI
     uses to enable the Windows/macOS/Linux buttons;
  3. merges *signed* updater entries from each latest.json into the repo's
     latest.json (unsigned builds are never advertised to the auto-updater).

Usage:
    merge-updater-manifest.py [--search DIR]... <dest_dir> <manifest...>
"""

import argparse
import json
import re
import shutil
import sys
from pathlib import Path

HOST = "https://anontweet.vercel.app/downloads/desktop"
VERSION_RE = re.compile(r"(\d+\.\d+\.\d+)")


def product_files(search_dirs: list[Path]):
    """All artifact files whose name starts with the product name."""
    found: list[Path] = []
    seen: set[str] = set()
    for root in search_dirs:
        if not root.is_dir():
            continue
        for p in root.rglob("*"):
            if not p.is_file():
                continue
            low = p.name.lower()
            if low.startswith("anontweet") or low.startswith("anon_tweet"):
                if p.name not in seen:
                    seen.add(p.name)
                    found.append(p)
    return found


def platform_for(filename: str) -> str | None:
    low = filename.lower()
    if "setup.exe" in low or low.endswith(".msi"):
        return "windows-x86_64"
    if low.endswith(".appimage") or low.endswith(".deb") or low.endswith(".rpm"):
        if "aarch64" in low or "arm64" in low:
            return "linux-arm64"
        return "linux-x86_64"
    if low.endswith(".dmg") or ".app.tar.gz" in low:
        if "aarch64" in low or "arm64" in low:
            return "darwin-aarch64"
        return "darwin-x86_64"
    return None


def detect_version(base_version: str, manifests: list[Path], search_dirs: list[Path]) -> str:
    # The manifests describe what was just built; trust them over the committed
    # base manifest (which may hold the previous Windows release).
    for manifest_path in manifests:
        try:
            data = json.loads(manifest_path.read_text())
            if data.get("version"):
                return data["version"]
        except Exception:
            continue
    # Unsigned builds ship no manifest; the fresh artifacts carry their version.
    best = ""
    for p in product_files(search_dirs):
        m = VERSION_RE.search(p.name)
        if m and m.group(1) > best:
            best = m.group(1)
    if best:
        return best
    if base_version:
        return base_version
    return ""


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dest_dir", type=Path)
    parser.add_argument("manifests", nargs="*", type=Path, metavar="manifest")
    parser.add_argument(
        "--search",
        action="append",
        default=[],
        type=Path,
        metavar="DIR",
        help="directory tree(s) to locate build artifacts in (the CI artifact dir)",
    )
    args = parser.parse_args()

    dest_dir = args.dest_dir.resolve()
    search_dirs = [d.resolve() for d in args.search]
    manifests = [m.resolve() for m in args.manifests]

    # --- read the existing (Windows-authored) manifest -----------------------
    base = dest_dir / "latest.json"
    merged: dict = {"version": "", "notes": "", "pub_date": "", "platforms": {}}
    # Files referenced by any updater URL must never be pruned, even when they
    # belong to an older revision (CI never builds Windows, so the committed
    # installer is the only copy of that artifact).
    referenced: set[str] = set()
    if base.exists():
            try:
                existing = json.loads(base.read_text())
                merged["version"] = existing.get("version", "")
                merged["notes"] = existing.get("notes", "")
                merged["pub_date"] = existing.get("pub_date", "")
                merged["platforms"] = {
                    k: v for k, v in existing.get("platforms", {}).items()
                }
                for entry in merged["platforms"].values():
                    url = (entry.get("url") or "").strip()
                    if url:
                        basename = Path(url.split("/")[-1]).name
                        referenced.add(basename)
                        referenced.add(basename + ".sig")
            except json.JSONDecodeError:
                print(f"warn: ignoring malformed {base}", file=sys.stderr)

    version = detect_version(merged["version"], manifests, search_dirs)
    if not version:
        print("error: could not determine the release version", file=sys.stderr)
        return 1
    if merged["version"] and merged["version"] != version:
        print(f"note: manifest version {version} supersedes base {merged['version']}", file=sys.stderr)
    merged["version"] = version

    # --- copy every artifact (signed or not) for direct download -------------
    dest_dir.mkdir(parents=True, exist_ok=True)
    copied: list[str] = []
    for artifact in product_files(search_dirs):
        shutil.copy2(artifact, dest_dir / artifact.name)
        copied.append(artifact.name)
        sig = Path(str(artifact) + ".sig")
        if sig.is_file():
            shutil.copy2(sig, dest_dir / sig.name)
            copied.append(sig.name)

    # --- merge signed updater entries into latest.json -----------------------
    for manifest_path in sorted(manifests):
        if not manifest_path.is_file():
            continue
        try:
            data = json.loads(manifest_path.read_text())
        except json.JSONDecodeError:
            print(f"warn: skipping malformed manifest {manifest_path}", file=sys.stderr)
            continue

        for name, entry in data.get("platforms", {}).items():
            signature = (entry.get("signature") or "").strip()
            if not signature:
                print(f"skip {name}: no signature (unsigned build)", file=sys.stderr)
                continue
            url = (entry.get("url") or "").strip()
            basename = Path(url.split("/")[-1]).name if url else name
            referenced.add(basename)
            # keep the detached signature next to any still-installed artifact
            referenced.add(basename + ".sig")
            merged["platforms"][name] = {
                "signature": signature,
                "url": f"{HOST}/{basename}",
            }

        if not merged["version"]:
            merged["version"] = data.get("version", version)
        if not merged["notes"]:
            merged["notes"] = data.get("notes", "")
        if not merged["pub_date"]:
            merged["pub_date"] = data.get("pub_date", "")

    # --- prune stale artifacts from the download directory -------------------
    # Runs after the merge so referenced files (e.g. the committed Windows
    # installer, which CI never rebuilds) are always preserved.
    if dest_dir.is_dir():
        for f in dest_dir.iterdir():
            if not f.is_file():
                continue
            low = f.name.lower()
            if (
                low.startswith("anontweet")
                and version not in f.name
                and f.name not in referenced
            ):
                print(f"prune: {f.name}")
                f.unlink()

    # --- available.json for the download page --------------------------------
    grouped: dict[str, list[str]] = {}
    for f in dest_dir.iterdir():
        if not f.is_file():
            continue
        low = f.name.lower()
        if not low.startswith("anontweet") or low.endswith(".sig"):
            continue
        key = platform_for(f.name)
        if key:
            grouped.setdefault(key, []).append(f.name)
    for key in grouped:
        grouped[key].sort()
    (dest_dir / "available.json").write_text(
        json.dumps({"version": version, "files": grouped}, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    base.write_text(
        json.dumps(merged, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    if copied:
        print("copied artifacts:")
        for name in sorted(set(copied)):
            print(f"  {name}")
    print("available platforms:", ", ".join(sorted(grouped)) or "(none)")
    print("updater platforms:", ", ".join(sorted(merged["platforms"])) or "(none)")
    print(f"wrote {base} and {dest_dir / 'available.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())