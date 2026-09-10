#!/usr/bin/env python3
"""Merge per-platform Tauri updater manifests into a single hosted latest.json.

Tauri writes one latest.json per build (each containing only the platforms that
build produced, e.g. linux-x86_64 or darwin-aarch64). This tool merges them all
into the repo's public/downloads/desktop/latest.json, copies the referenced
artifacts + signatures into that directory, and rewrites their URLs to the
Vercel-hosted location.

Platform entries without a signature are skipped (unsigned builds must never be
advertised to the updater).

Usage:
    merge-updater-manifest.py [--search DIR]... <dest_dir> <manifest...>
"""

import argparse
import json
import shutil
import sys
from pathlib import Path

HOST = "https://anontweet.vercel.app/downloads/desktop"


def resolve_artifact(basename: str, search_dirs: list[Path]) -> Path | None:
    for root in search_dirs:
        if not root.is_dir():
            continue
        hits = list(root.rglob(basename))
        if hits:
            return hits[0]
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dest_dir", type=Path)
    parser.add_argument("manifests", nargs="+", type=Path)
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

    merged: dict = {
        "version": "",
        "notes": "",
        "pub_date": "",
        "platforms": {},
    }

    base = dest_dir / "latest.json"
    if base.exists():
        try:
            existing = json.loads(base.read_text())
            merged["version"] = existing.get("version", "")
            merged["notes"] = existing.get("notes", "")
            merged["pub_date"] = existing.get("pub_date", "")
            merged["platforms"] = {
                k: v for k, v in existing.get("platforms", {}).items()
            }
        except json.JSONDecodeError:
            print(f"warn: ignoring malformed {base}", file=sys.stderr)

    copied: list[str] = []

    for manifest_path in sorted(args.manifests):
        manifest_path = manifest_path.resolve()
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
            if not url:
                continue

            basename = Path(url.split("/")[-1]).name
            artifact = (manifest_path.parent / basename).resolve()
            if not artifact.is_file():
                artifact = resolve_artifact(basename, search_dirs)
            if artifact is None or not artifact.is_file():
                print(f"warn: artifact not found: {basename}", file=sys.stderr)
                continue

            target = dest_dir / basename
            shutil.copy2(artifact, target)
            copied.append(basename)
            sig_file = Path(str(artifact) + ".sig")
            if sig_file.is_file():
                shutil.copy2(sig_file, dest_dir / sig_file.name)
                copied.append(sig_file.name)

            merged["platforms"][name] = {
                "signature": signature,
                "url": f"{HOST}/{basename}",
            }

        version = data.get("version", "")
        if version and not merged["version"]:
            merged["version"] = version
        if data.get("notes") and not merged["notes"]:
            merged["notes"] = data["notes"]
        if data.get("pub_date") and not merged["pub_date"]:
            merged["pub_date"] = data["pub_date"]

    if not merged["version"]:
        print("error: no version found in any manifest", file=sys.stderr)
        return 1

    dest_dir.mkdir(parents=True, exist_ok=True)
    base.write_text(
        json.dumps(merged, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    distinct = sorted(set(copied))
    if distinct:
        print("copied artifacts:")
        for name in distinct:
            print(f"  {name}")
    print("merged platforms:", ", ".join(sorted(merged["platforms"])))
    print(f"wrote {base}")
    return 0


if __name__ == "__main__":
    sys.exit(main())