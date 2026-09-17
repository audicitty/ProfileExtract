/**
 * Creates bench/.venv and installs oracle B plus the rasteriser into it.
 *
 *   node bench/setup-python.mjs
 *
 * Development-only. The venv is gitignored and nothing in src/ touches it.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

import { BENCH_DIR } from "./paths.mjs";

const VENV_DIR = path.join(BENCH_DIR, ".venv");
const venvPython = () =>
  process.platform === "win32"
    ? path.join(VENV_DIR, "Scripts", "python.exe")
    : path.join(VENV_DIR, "bin", "python");

const run = (cmd, args, label) => {
  console.log(`\n> ${label}`);
  const result = spawnSync(cmd, args, { stdio: "inherit", timeout: 900_000 });
  if (result.status !== 0) {
    throw new Error(`${label} failed (exit ${result.status})`);
  }
};

const systemPython = process.env.PYTHON ?? (process.platform === "win32" ? "python" : "python3");

if (!existsSync(venvPython())) {
  run(systemPython, ["-m", "venv", VENV_DIR], "creating bench/.venv");
}

run(venvPython(), ["-m", "pip", "install", "--upgrade", "pip", "--quiet"], "upgrading pip");
run(
  venvPython(),
  ["-m", "pip", "install", "-r", path.join(BENCH_DIR, "parsers", "requirements.txt")],
  "installing bench/parsers/requirements.txt"
);
run(
  venvPython(),
  ["-m", "spacy", "download", "en_core_web_sm"],
  "downloading spaCy en_core_web_sm"
);

console.log(`\nbench/.venv ready: ${venvPython()}`);
