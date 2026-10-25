"""Regression checks for accidental private-file inclusion in release ZIPs."""
import importlib.util
import json
import os
import subprocess
import tempfile
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("packager", ROOT / "scripts/package-release.py")
packager = importlib.util.module_from_spec(spec)
spec.loader.exec_module(packager)


class PackagingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="game-night-package-test-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.names = ["release-files.json", "package.json", "server/game.js", ".env.example"]
        self.write("package.json", json.dumps({"version": "0.0.0"}))
        self.write("server/game.js", "// public game fixture\n")
        self.write(".env.example", "# Public setup example\n")
        self.write("dist/index.html", '<script src="/assets/game-test.js"></script>')
        self.write("dist/favicon.svg", "<svg/>")
        self.write("dist/assets/game-test.js", "// public screen fixture\n")
        self.write("dist/assets/game-test.css", "body { color: green; }")
        self.write("dist/assets/font-test.woff2", "synthetic-font-fixture")
        self.build = {"index.html": {"isEntry": True, "file": "assets/game-test.js",
            "css": ["assets/game-test.css"], "assets": ["assets/font-test.woff2"]}}
        self.save_manifests()

    def write(self, name, content):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")

    def save_manifests(self):
        self.write("release-files.json", json.dumps(self.names))
        self.write("dist/.vite/manifest.json", json.dumps(self.build))

    def test_unlisted_files_never_enter_zip_even_in_public_folders(self):
        marker = "SYNTHETIC_PRIVATE_CANARY_NOT_A_REAL_SECRET"
        for folder in ["server", "src", "public", "docs", "scripts", "tests", "dist", "dist/assets"]:
            for filename in [".env.review-canary", "notes.txt", "session.json", "debug.log", "unexpected.js"]:
                self.write(folder + "/" + filename, marker)
        archive = packager.package_release(self.root)
        with zipfile.ZipFile(archive) as zipped:
            names = {n.removeprefix("game-night-0.0.0/") for n in zipped.namelist()}
            self.assertEqual(names, set(self.names) | {
                "dist/index.html", "dist/favicon.svg", "dist/assets/game-test.js",
                "dist/assets/game-test.css", "dist/assets/font-test.woff2"})
            for entry in zipped.namelist():
                self.assertNotIn(marker.encode(), zipped.read(entry))

    def test_missing_reviewed_file_stops_release(self):
        (self.root / "server/game.js").unlink()
        with self.assertRaises(ValueError):
            packager.release_files(self.root)
        self.assertFalse((self.root / "release").exists())

    def test_manifest_rejects_private_paths_traversal_and_duplicates(self):
        for name in ["../outside.txt", "/outside.txt", "C:/outside.txt", "server\\game.js",
                     "server/.env", "docs/key.pem", ".runtime/session.json", "dist/index.html",
                     "server/../package.json", "server//game.js", "package.json",
                     "server/key.pem.", "docs/note.txt ", "docs/CON.txt", "docs/name?.txt",
                     ".git./config", "Dist/index.html", "PACKAGE.JSON"]:
            with self.subTest(name=name):
                original = self.names[:]
                self.names.append(name)
                self.save_manifests()
                with self.assertRaises(ValueError):
                    packager.source_files(self.root)
                self.names = original

    def test_build_rejects_unsafe_referenced_assets(self):
        for name in ["../server/.env", "assets/session.json", "assets/game.js.map", "/outside.js",
                     "assets/../outside.js", "assets\\outside.js"]:
            with self.subTest(name=name):
                self.build["index.html"]["assets"] = [name]
                self.save_manifests()
                with self.assertRaises(ValueError):
                    packager.build_files(self.root)

    def test_unreferenced_manifest_entry_is_excluded(self):
        self.write("dist/assets/unrelated.js", "synthetic private note")
        self.build["unrelated.js"] = {"file": "assets/unrelated.js"}
        self.save_manifests()
        self.assertNotIn("dist/assets/unrelated.js", packager.build_files(self.root))

    def test_imported_chunks_are_included(self):
        self.write("dist/assets/extra.js", "// public chunk")
        self.build["index.html"]["dynamicImports"] = ["extra.js"]
        self.build["extra.js"] = {"file": "assets/extra.js"}
        self.save_manifests()
        self.assertIn("dist/assets/extra.js", packager.build_files(self.root))

    def test_invalid_build_entry_stops_release(self):
        for entry in [[], None, "index.html", {"file": "assets/game-test.js", "isEntry": "true"}]:
            with self.subTest(entry=entry):
                self.build["index.html"] = entry
                self.save_manifests()
                with self.assertRaises(ValueError):
                    packager.build_files(self.root)

    def test_parent_folder_symlink_is_rejected(self):
        target = self.root / "target"
        target.mkdir()
        (target / "note.txt").write_text("synthetic private note", encoding="utf-8")
        try:
            (self.root / "linked").symlink_to(target, target_is_directory=True)
        except OSError:
            self.skipTest("This account cannot create directory symlinks.")
        with self.assertRaises(ValueError):
            packager.public_file(self.root, "linked/note.txt")

    @unittest.skipUnless(os.name == "nt", "NTFS junctions are Windows-specific.")
    def test_windows_junctions_are_rejected_in_source_and_output(self):
        target = self.root / "target"
        target.mkdir()
        (target / "note.txt").write_text("synthetic private note", encoding="utf-8")
        # Arguments come only from this temporary fixture. Use one native shell.
        for link_name in ["linked", "release"]:
            link = self.root / link_name
            command = "New-Item -ItemType Junction -Path $env:TEST_JUNCTION_PATH -Target $env:TEST_JUNCTION_TARGET | Out-Null"
            subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", command],
                env={**os.environ, "TEST_JUNCTION_PATH": str(link), "TEST_JUNCTION_TARGET": str(target)},
                check=True, capture_output=True, text=True)
        with self.assertRaises(ValueError):
            packager.public_file(self.root, "linked/note.txt")
        with self.assertRaises(ValueError):
            packager.package_release(self.root)

    def test_public_manifest_covers_tracked_files_when_git_is_available(self):
        # Release ZIPs deliberately have no .git folder.
        if not (ROOT / ".git").exists():
            self.skipTest("Not a Git checkout.")
        tracked = set(subprocess.check_output(["git", "ls-files"], cwd=ROOT, text=True).splitlines())
        reviewed = set(json.loads((ROOT / "release-files.json").read_text(encoding="utf-8")))
        self.assertFalse(tracked - reviewed, "Review and list every tracked public file before release.")


if __name__ == "__main__":
    unittest.main()
