"""Build a portable source + prebuilt-screens ZIP from an explicit public file list."""
import hashlib
import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERSION = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
NAME = f"game-night-{VERSION}"
OUT = ROOT / "release"
FILES = ["package.json", "package-lock.json", "index.html", "vite.config.js", ".env.example",
         "Start Game Night.cmd", "README.md", "LICENSE", "THIRD_PARTY_NOTICES.md",
         "CONTENT-NOTES.md", "CONTRIBUTING.md", "SECURITY.md", ".gitignore", ".gitattributes"]
DIRS = ["server", "src", "public", "dist", "licenses", "docs", "scripts", "tests"]

if not (ROOT / "dist/index.html").is_file():
    raise SystemExit("Run npm run build first.")
OUT.mkdir(exist_ok=True)
paths = [ROOT / name for name in FILES]
for directory in DIRS:
    paths.extend(p for p in (ROOT / directory).rglob("*")
                 if p.is_file() and "__pycache__" not in p.parts and p.suffix != ".pyc")
for path in paths:
    if path.is_symlink() or not path.resolve().is_relative_to(ROOT.resolve()):
        raise SystemExit("Refusing a file outside the project: " + str(path))
archive = OUT / f"{NAME}.zip"
with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as z:
    for path in sorted(paths):
        z.write(path, str(Path(NAME) / path.relative_to(ROOT)))
digest = hashlib.sha256(archive.read_bytes()).hexdigest()
(OUT / f"{NAME}.sha256").write_text(f"{digest}  {archive.name}\n", encoding="utf-8")
print(f"Created {archive.name} ({archive.stat().st_size:,} bytes), {len(paths)} files.")
print(f"SHA-256: {digest}")
