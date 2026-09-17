/** Shared paths and the Python interpreter the bench shells out to. */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const BENCH_DIR = path.dirname(fileURLToPath(import.meta.url));
export const OUT_DIR = path.join(BENCH_DIR, "out");
export const HTML_DIR = path.join(OUT_DIR, "html");
export const PDF_DIR = path.join(OUT_DIR, "fixtures");
export const RESULTS_DIR = path.join(BENCH_DIR, "results");

/**
 * Oracle B and the rasteriser run in bench/.venv (gitignored, created by
 * `node bench/setup-python.mjs`). BENCH_PYTHON overrides it.
 */
export const benchPython = () => {
  if (process.env.BENCH_PYTHON) return process.env.BENCH_PYTHON;
  const candidates = [
    path.join(BENCH_DIR, ".venv", "Scripts", "python.exe"),
    path.join(BENCH_DIR, ".venv", "bin", "python"),
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(
      "bench/.venv not found. Run: node bench/setup-python.mjs (or set BENCH_PYTHON)."
    );
  }
  return found;
};
