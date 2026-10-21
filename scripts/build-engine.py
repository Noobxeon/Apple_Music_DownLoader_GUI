"""Run with the build venv Python; packages the engine and third-party notices."""
import importlib.metadata
import json
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
VERSION = "3.9.1"
assert importlib.metadata.version("gamdl") == VERSION, "Install backend/requirements-build.txt first"

command = [sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean", "--onedir", "--console",
           "--name", "gamdl-engine", "--distpath", str(ROOT / "vendor"),
           "--workpath", str(ROOT / ".build" / "engine"), "--specpath", str(ROOT / ".build"),
           "--collect-all", "gamdl", "--collect-all", "yt_dlp", "--collect-all", "pywidevine",
           "--collect-all", "pyplayready", "--collect-data", "certifi",
           "--recursive-copy-metadata", "gamdl", str(ROOT / "backend" / "engine_entry.py")]
subprocess.run(command, cwd=ROOT, check=True)
target = ROOT / "vendor" / "gamdl-engine"
notices = target / "licenses"
notices.mkdir(exist_ok=True)
manifest = []
for distribution in importlib.metadata.distributions():
    name = distribution.metadata["Name"]
    if name.lower() in {"pip", "setuptools", "pyinstaller", "pyinstaller-hooks-contrib", "altgraph", "pefile", "pywin32-ctypes", "packaging"}:
        continue
    manifest.append({"name": name, "version": distribution.version,
                     "license": distribution.metadata.get("License-Expression") or distribution.metadata.get("License", "See package notices")})
    for file in distribution.files or []:
        if any(key in file.name.lower() for key in ["license", "copying", "notice"]):
            source = Path(distribution.locate_file(file))
            if source.is_file():
                destination = notices / name / str(file).replace("..", "_")
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, destination)
base_prefix = Path(sys.base_prefix)
for license_file in [base_prefix / "LICENSE.txt", base_prefix / "LICENSE"]:
    if license_file.exists():
        shutil.copy2(license_file, notices / "PYTHON-LICENSE.txt")
(target / "third-party.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
result = subprocess.run([str(target / "gamdl-engine.exe"), "--gui-self-test"], check=True, capture_output=True, text=True)
report = json.loads(result.stdout)
assert report["frozen"] and report["native"] and report["version"] == VERSION
print("Bundled engine verified:", result.stdout.strip())
download = subprocess.run([str(target / "gamdl-engine.exe"), "--gui-download-self-test"],
                          check=True, capture_output=True, text=True, encoding="utf-8", timeout=60)
probe = json.loads(download.stdout)
assert probe["worker"] and probe["http"] and probe["hls"]
assert probe["utf8"] == "日本語 中文 音楽"
print("Frozen worker HTTP/HLS/UTF-8 verified:", download.stdout.strip())
