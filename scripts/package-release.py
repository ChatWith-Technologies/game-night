"""Package reviewed files and build-manifest assets. Never walk source folders."""
import hashlib
import json
import re
import stat
import tempfile
import zipfile
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = "release-files.json"
BUILD_MANIFEST = "dist/.vite/manifest.json"
ASSET = re.compile(r"assets/[A-Za-z0-9_.-]+\.(?:js|css|woff2?|ttf|otf|png|jpe?g|svg|webp|gif)$")
PRIVATE_SUFFIXES = {".key", ".pem", ".p12", ".pfx", ".log", ".sqlite", ".db", ".map"}
PRIVATE_PARTS = {".git", ".runtime", "node_modules", "test-results", "release", "__pycache__"}
RESERVED_NAME = re.compile(r"(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?", re.IGNORECASE)


def is_link(path):
    # NTFS junctions are reparse points, but Path.is_symlink() does not detect them.
    try:
        attributes = getattr(path.lstat(), "st_file_attributes", 0)
    except FileNotFoundError:
        return False
    return path.is_symlink() or bool(attributes & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0))


def public_file(root, name):
    """Reject unsafe paths and symlinks, including symlinked parent folders."""
    if not isinstance(name, str) or not name or "\\" in name or ":" in name:
        raise ValueError("Release paths must be relative, forward-slash file names.")
    relative = PurePosixPath(name)
    if relative.is_absolute() or str(relative) != name or any(
        part in {".", ".."} or part.endswith((".", " "))
        or RESERVED_NAME.fullmatch(part)
        or any(ord(c) < 32 or c in '<>"|?*' for c in part)
        for part in relative.parts
    ):
        raise ValueError("Unsafe release path.")
    for part in relative.parts:
        lower = part.lower()
        if lower in PRIVATE_PARTS or (
            lower.startswith(".env") and name != ".env.example"
        ) or PurePosixPath(lower).suffix in PRIVATE_SUFFIXES:
            raise ValueError("Private or generated file type in release manifest.")
    root = root.resolve()
    path = root
    for part in relative.parts:
        path = path / part
        if is_link(path):
            raise ValueError("Symlinks and junctions are not allowed in releases.")
    if not path.resolve().is_relative_to(root) or not path.is_file():
        raise ValueError("A listed release file is missing or outside the project: " + name)
    return path


def source_files(root):
    manifest_path = public_file(root, MANIFEST)
    names = json.loads(manifest_path.read_text(encoding="utf-8"))
    if not isinstance(names, list) or not names or not all(isinstance(n, str) for n in names):
        raise ValueError("The release manifest must be a nonempty list of file names.")
    if len({name.casefold() for name in names}) != len(names) or MANIFEST not in names:
        raise ValueError("The release manifest must include itself and have no duplicates.")
    if any(n.casefold().startswith("dist/") for n in names):
        raise ValueError("Build output must come from the Vite manifest, not the source manifest.")
    return {name: public_file(root, name) for name in names}


def build_files(root):
    manifest = json.loads(public_file(root, BUILD_MANIFEST).read_text(encoding="utf-8"))
    entry = manifest.get("index.html") if isinstance(manifest, dict) else None
    if not isinstance(entry, dict) or entry.get("isEntry") is not True:
        raise ValueError("Run npm run build to create the entry-point build manifest.")
    names = {"index.html", "favicon.svg"}
    visited = set()

    def visit(key):
        if key in visited:
            return
        visited.add(key)
        entry = manifest.get(key)
        if not isinstance(entry, dict) or not isinstance(entry.get("file"), str):
            raise ValueError("Invalid entry in the build manifest.")
        assets = [entry["file"]]
        for field in ("css", "assets"):
            values = entry.get(field, [])
            if not isinstance(values, list) or not all(isinstance(v, str) for v in values):
                raise ValueError("Invalid asset list in the build manifest.")
            assets.extend(values)
        for name in assets:
            if not ASSET.fullmatch(name):
                raise ValueError("Unexpected build asset type or path.")
            names.add(name)
        for field in ("imports", "dynamicImports"):
            imports = entry.get(field, [])
            if not isinstance(imports, list) or not all(isinstance(v, str) for v in imports):
                raise ValueError("Invalid import list in the build manifest.")
            for imported in imports:
                visit(imported)

    visit("index.html")
    # Unrelated files and unused manifest entries are deliberately not packaged.
    return {"dist/" + name: public_file(root, "dist/" + name) for name in names}


def release_files(root):
    paths = {**source_files(root), **build_files(root)}
    if len({name.casefold() for name in paths}) != len(paths):
        raise ValueError("Release paths must not differ only by letter case.")
    return paths


def package_release(root=ROOT):
    root = Path(root).resolve()
    paths = release_files(root)
    version = json.loads(public_file(root, "package.json").read_text(encoding="utf-8"))["version"]
    if not isinstance(version, str) or not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?", version):
        raise ValueError("Invalid release version.")
    name = "game-night-" + version
    output = root / "release"
    if is_link(output):
        raise ValueError("The release output folder must not be a link or junction.")
    output.mkdir(exist_ok=True)
    archive = output / (name + ".zip")
    checksum = output / (name + ".sha256")
    if is_link(archive) or is_link(checksum):
        raise ValueError("Release output files must not be links.")
    # Finish validation before writing. Replace the ZIP only when it is complete.
    with tempfile.NamedTemporaryFile(dir=output, suffix=".zip", delete=False) as handle:
        temporary = Path(handle.name)
    try:
        with zipfile.ZipFile(temporary, "w", zipfile.ZIP_DEFLATED) as zipped:
            for relative, path in sorted(paths.items()):
                zipped.write(path, name + "/" + relative)
        digest = hashlib.sha256(temporary.read_bytes()).hexdigest()
        temporary.replace(archive)
    finally:
        temporary.unlink(missing_ok=True)
    checksum.write_text(f"{digest}  {archive.name}\n", encoding="utf-8")
    print(f"Created {archive.name} ({archive.stat().st_size:,} bytes), {len(paths)} files.")
    print(f"SHA-256: {digest}")
    return archive


if __name__ == "__main__":
    try:
        package_release()
    except (ValueError, KeyError, OSError) as error:
        raise SystemExit("Release stopped: " + str(error)) from None
