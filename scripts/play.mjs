import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 12)) {
  console.error(
    "Game Night needs Node.js 22.12 or newer. Node.js 24 is recommended.",
  );
  process.exit(1);
}
process.chdir(root);

function run(command) {
  // Commands are fixed here; no user input is passed to the shell.
  const result = spawnSync(command, {
    cwd: root,
    shell: true,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    console.error(
      "Setup did not finish. Check the message above and try again.",
    );
    process.exit(result.status || 1);
  }
}

if (!existsSync(path.join(root, "node_modules/express/package.json"))) {
  console.log("Installing Game Night. This first step needs internet access.");
  run(
    existsSync(path.join(root, "dist/index.html"))
      ? "npm ci --omit=dev"
      : "npm ci",
  );
}
if (!existsSync(path.join(root, "dist/index.html"))) {
  console.log("Building the game screens. This only runs on the first start.");
  run("npm run build");
}
await import("../server/index.js");
