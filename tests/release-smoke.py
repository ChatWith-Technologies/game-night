"""Extract the downloadable ZIP and run the real first-start launcher."""
import json
import os
import socket
import subprocess
import tempfile
import time
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERSION = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
ARCHIVE = ROOT / "release" / f"game-night-{VERSION}.zip"

with tempfile.TemporaryDirectory(prefix="game-night-release-") as temp:
    with zipfile.ZipFile(ARCHIVE) as archive:
        for name in archive.namelist():
            assert (Path(temp) / name).resolve().is_relative_to(Path(temp).resolve())
        archive.extractall(temp)
    folder = Path(temp) / f"game-night-{VERSION}"
    assert not (folder / "node_modules").exists()
    assert not (folder / ".env").exists()
    assert not (folder / ".git").exists()
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    base = f"http://127.0.0.1:{port}"
    with (Path(temp) / "launcher.log").open("w+", encoding="utf-8") as log:
        server = subprocess.Popen(["node", "scripts/play.mjs"], cwd=folder,
            env={**os.environ, "PORT": str(port), "GAME_LAN_IP": "127.0.0.1"},
            stdout=log, stderr=subprocess.STDOUT,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
        try:
            for _ in range(240):
                if server.poll() is not None:
                    log.seek(0)
                    raise RuntimeError(log.read())
                try:
                    with urllib.request.urlopen(base + "/api/health", timeout=1) as response:
                        health = json.load(response)
                    break
                except OSError:
                    time.sleep(.5)
            else:
                log.seek(0)
                raise RuntimeError("Launcher did not start: " + log.read())
            assert health["app"] == "chatwith-game-night"
            assert health["version"] == VERSION
            with urllib.request.urlopen(base, timeout=3) as response:
                assert "Game Night by ChatWith" in response.read().decode()
            assert (folder / "node_modules/express").is_dir()
            assert not (folder / "node_modules/vite").exists(), "Release should not need build tools"
            print("PASS: Clean release installed runtime packages and served the built game.", flush=True)
        finally:
            server.terminate()
            server.wait(timeout=10)
