import {
  environment,
  LaunchType,
  Toast,
  showToast,
  getPreferenceValues,
  updateCommandMetadata,
} from "@raycast/api";
import { existsSync } from "fs";
import { join } from "path";
import { expand, findDb, pythonBin } from "./lib/logos";
import { execFile } from "child_process";
import { promisify } from "util";

const pexec = promisify(execFile);

interface Prefs {
  vaultPath: string;
  toolkitPath: string;
  downloadImages: boolean;
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
