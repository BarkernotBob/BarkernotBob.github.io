import { existsSync, readdirSync, statSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const pexec = promisify(execFile);

/** Expand a leading ~ to the user's home directory. */
export function expand(p?: string): string {
  const t = (p || "").trim();
  return t.startsWith("~") ? join(homedir(), t.slice(1)) : t;
}

/** Raycast runs with a minimal PATH, so resolve python3 explicitly. */
export function pythonBin(): string {
  for (const p of ["/opt/homebrew/bin/python3", "/usr/local/bin/python3", "/usr/bin/python3"]) {
    if (existsSync(p)) return p;
  }
  return "python3";
}

/** Largest notestool.db found under a root (bounded recursion). */
function largestNotestool(root: string): { size: number; path: string } | null {
  let best: { size: number; path: string } | null = null;
  const walk = (dir: string, depth: number) => {
    if (depth > 6 || !existsSync(dir)) return;
    let entries: string[] = [];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      const full = join(dir, name);
      let s;
      try {
        s = statSync(full);
      } catch {
        continue;
      }
      if (s.isDirectory()) walk(full, depth + 1);
      else if (name.toLowerCase() === "notestool.db" && (!best || s.size > best.size)) {
        best = { size: s.size, path: full };
      }
    }
  };
  walk(root, 0);
  return best;
}

/**
 * Locate the active Logos notes database (the largest notestool.db).
 * If overrideDir is set, search there; otherwise the standard Logos/Verbum spots.
 */
export function findDb(overrideDir?: string): string | null {
  if (overrideDir && overrideDir.trim()) {
    return largestNotestool(expand(overrideDir))?.path ?? null;
  }
  let best: { size: number; path: string } | null = null;
  for (const app of ["Logos4", "Verbum"]) {
    const docs = join(homedir(), "Library", "Application Support", app, "Documents");
    const b = largestNotestool(docs);
    if (b && (!best || b.size > best.size)) best = b;
  }
  return best?.path ?? null;
}

/** Run a python3 script and return stdout. */
export async function runPython(args: string[], timeoutMs = 5 * 60 * 1000): Promise<string> {
  const { stdout } = await pexec(pythonBin(), args, {
    maxBuffer: 64 * 1024 * 1024,
    timeout: timeoutMs,
  });
  return stdout;
}

/** Native Logos deep link that opens one exact note in the desktop app. */
export function editNoteUrl(externalId: string): string {
  const id = (externalId || "").replace(/[^0-9a-fA-F]/g, "").toLowerCase();
  return `logos4:NotesTool?EditNoteId=${id}`;
}
