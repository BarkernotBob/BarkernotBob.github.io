import { existsSync } from "fs";
import { join } from "path";
import { expand, findDb, runPython } from "./logos";

export interface LogosNote {
  id: string; // ExternalId -> used for the EditNoteId deep link
  title: string;
  body: string; // Markdown (converted, not raw rich text)
  notebook: string;
  tags: string[];
  reference: string; // human anchored reference, e.g. "Romans 8:6" (may be "")
  referenceUrl: string; // ref.ly link for the reference (may be "")
  modified: number; // epoch ms, 0 if unknown
  searchBlob: string; // lowercased haystack for "match everything"
}

interface RawNote {
  id: string;
  title: string;
  body: string;
  notebook: string;
  tags: string[];
  reference: string;
  referenceUrl: string;
  modified: string;
}

export interface LoadResult {
  notes: LogosNote[];
  dbPath: string | null;
  error?: string;
}

/**
 * Load notes by running the toolkit's logos_notes_json.py (read-only) and
 * parsing its JSON. Reuses the exact converter the importer uses.
 */
export async function loadNotes(toolkitPath: string, logosDataDir?: string): Promise<LoadResult> {
  const toolkit = expand(toolkitPath);
  const script = join(toolkit, "logos_notes_json.py");
  if (!existsSync(script)) {
    return { notes: [], dbPath: null, error: `logos_notes_json.py not found in ${toolkit || "(unset)"}` };
  }
  const dbPath = findDb(logosDataDir);
  if (!dbPath) {
    return { notes: [], dbPath: null, error: "No Logos notestool.db found — is Logos installed?" };
  }

  let stdout: string;
  try {
    stdout = await runPython([script, dbPath]);
  } catch (e) {
    const err = e as { stderr?: string; message?: string };
    const msg = (err.stderr || err.message || String(e)).toString().trim().split("\n").pop() || "read failed";
    return { notes: [], dbPath, error: msg };
  }

  let raw: RawNote[];
  try {
    raw = JSON.parse(stdout) as RawNote[];
  } catch {
    return { notes: [], dbPath, error: "Could not parse notes output" };
  }

  const notes: LogosNote[] = raw.map((n) => {
    const tags = Array.isArray(n.tags) ? n.tags : [];
    const modified = n.modified ? Date.parse(n.modified) : 0;
    const searchBlob = [n.body, n.notebook, tags.join(" "), n.reference].join("  ").toLowerCase();
    return {
      id: n.id,
      title: n.title || "(untitled note)",
      body: n.body || "",
      notebook: n.notebook || "",
      tags,
      reference: n.reference || "",
      referenceUrl: n.referenceUrl || "",
      modified: Number.isNaN(modified) ? 0 : modified,
      searchBlob,
    };
  });

  notes.sort((a, b) => b.modified - a.modified);
  return { notes, dbPath };
}
