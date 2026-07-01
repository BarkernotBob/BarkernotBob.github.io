import {
  environment,
  LaunchType,
  Toast,
  showToast,
  getPreferenceValues,
  updateCommandMetadata,
} from "@raycast/api";
import { execFile } from "child_process";
import { promisify } from "util";
import { existsSync, statSync, readdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const pexec = promisify(execFile);

interface Prefs {
  vaultPath: string;
  toolkitPath: string;
  downloadImages: boolean;
}

/** Expand a leading ~ to the user's home directory. */
function expand(p: string): string {
  const t = (p || "").trim();
  return t.startsWith("~") ? join(homedir(), t.slice(1)) : t;
}

/** Raycast runs with a minimal PATH, so resolve python3 explicitly. */
function pythonBin(): string {
  for (const p of ["/opt/homebrew/bin/python3", "/usr/local/bin/python3", "/usr/bin/python3"]) {
    if (existsSync(p)) return p;
  }
  return "python3";
}

/** Find the largest notestool.db (the active account) for Logos or Verbum. */
function findDb(): string | null {
  let best: { size: number; path: string } | null = null;
  for (const app of ["Logos4", "Verbum"]) {
    const docs = join(homedir(), "Library", "Application Support", app, "Documents");
    if (!existsSync(docs)) continue;
    for (const dir of readdirSync(docs)) {
      const db = join(docs, dir, "NotesToolManager", "notestool.db");
      if (existsSync(db)) {
        const size = statSync(db).size;
        if (!best || size > best.size) best = { size, path: db };
      }
    }
  }
  return best?.path ?? null;
}

export default async function main(): Promise<void> {
  const prefs = getPreferenceValues<Prefs>();
  const manual = environment.launchType === LaunchType.UserInitiated;
  const vault = expand(prefs.vaultPath);
  const toolkit = expand(prefs.toolkitPath);
  const script = join(toolkit, "logos_to_md.py");

  const fail = async (message: string) => {
    await updateCommandMetadata({ subtitle: `Last sync failed — ${message}` });
    if (manual) await showToast({ style: Toast.Style.Failure, title: "Logos sync failed", message });
  };

  if (!existsSync(script)) return fail(`logos_to_md.py not found in ${toolkit}`);
  if (!existsSync(vault)) return fail(`Vault folder not found: ${vault}`);
  const db = findDb();
  if (!db) return fail("No Logos notestool.db found — is Logos installed?");

  if (manual) {
    await showToast({ style: Toast.Style.Animated, title: "Syncing Logos notes…" });
  }

  // The converter opens the database READ-ONLY, so this is safe even while Logos
  // is open (we never quit it). Worst case a just-typed, unsaved note is missed
  // and picked up on the next run.
  const args = [script, db, vault];
  if (!prefs.downloadImages) args.push("--no-images");

  try {
    const { stdout } = await pexec(pythonBin(), args, {
      maxBuffer: 16 * 1024 * 1024,
      timeout: 5 * 60 * 1000,
    });
    const summary =
      stdout
        .split("\n")
        .map((l) => l.trim())
        .find((l) => l.startsWith("wrote")) ??
      stdout.trim().split("\n").pop() ??
      "done";
    const when = new Date().toLocaleString();
    await updateCommandMetadata({ subtitle: `${summary} · ${when}` });
    if (manual) {
      await showToast({ style: Toast.Style.Success, title: "Logos sync complete", message: summary });
    }
  } catch (e) {
    const err = e as { stderr?: string; message?: string };
    const msg = (err.stderr || err.message || String(e)).toString().trim().split("\n").pop() || "unknown error";
    return fail(msg);
  }
}
