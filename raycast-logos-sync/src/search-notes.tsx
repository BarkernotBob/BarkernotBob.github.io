import { useMemo, useState } from "react";
import {
  Action,
  ActionPanel,
  Detail,
  Icon,
  List,
  getPreferenceValues,
  open,
  Clipboard,
  showToast,
  Toast,
} from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { loadNotes, type LogosNote } from "./lib/notes";
import { editNoteUrl } from "./lib/logos";

interface Prefs {
  toolkitPath: string;
  logosDataDir?: string;
}

function markdownFor(note: LogosNote): string {
  const meta: string[] = [];
  if (note.notebook) meta.push(`**Notebook:** ${note.notebook}`);
  if (note.reference) meta.push(`**Reference:** ${note.reference}`);
  if (note.tags.length) meta.push(`**Tags:** ${note.tags.join(", ")}`);
  if (note.modified) meta.push(`**Modified:** ${new Date(note.modified).toLocaleString()}`);
  const header = meta.length ? meta.join("  ·  ") + "\n\n---\n\n" : "";
  return header + (note.body || "_(empty note)_");
}

function NoteDetail({ note }: { note: LogosNote }) {
  return (
    <Detail
      markdown={markdownFor(note)}
      actions={
        <ActionPanel>
          <Action title="Open in Logos" icon={Icon.Book} onAction={() => open(editNoteUrl(note.id))} />
          {note.referenceUrl ? (
            <Action.OpenInBrowser title="Open Anchored Reference" icon={Icon.Link} url={note.referenceUrl} />
          ) : null}
          <Action.CopyToClipboard title="Copy Note Text" content={note.body} />
        </ActionPanel>
      }
    />
  );
}

export default function Command() {
  const prefs = getPreferenceValues<Prefs>();
  const [query, setQuery] = useState("");

  const { data, isLoading, revalidate } = useCachedPromise(
    (toolkit: string, dir?: string) => loadNotes(toolkit, dir),
    [prefs.toolkitPath, prefs.logosDataDir],
    { keepPreviousData: true },
  );

  const notes = data?.notes ?? [];
  const dbPath = data?.dbPath ?? null;
  const loadError = data?.error;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notes.slice(0, 200);
    const terms = q.split(/\s+/);
    return notes.filter((n) => terms.every((t) => n.searchBlob.includes(t))).slice(0, 200);
  }, [notes, query]);

  if (!isLoading && (loadError || !dbPath)) {
    return (
      <List>
        <List.EmptyView
          icon={Icon.ExclamationMark}
          title="Couldn't read your Logos notes"
          description={
            loadError ??
            "Set the Toolkit Folder (and optionally Logos Data Directory) preference with ⌘, then reload."
          }
        />
      </List>
    );
  }

  return (
    <List
      isLoading={isLoading}
      onSearchTextChange={setQuery}
      searchBarPlaceholder="Search note text, notebook, tags, reference…"
      throttle
    >
      {filtered.map((note) => (
        <List.Item
          key={note.id}
          title={note.title}
          subtitle={note.notebook || note.reference || undefined}
          accessories={[
            ...(note.tags.length ? [{ tag: note.tags[0] }] : []),
            ...(note.modified ? [{ date: new Date(note.modified), tooltip: "Modified" }] : []),
          ]}
          actions={
            <ActionPanel>
              <Action.Push title="Preview Note" icon={Icon.Eye} target={<NoteDetail note={note} />} />
              <Action
                title="Open in Logos"
                icon={Icon.Book}
                shortcut={{ modifiers: ["cmd"], key: "return" }}
                onAction={() => open(editNoteUrl(note.id))}
              />
              {note.referenceUrl ? (
                <Action.OpenInBrowser
                  title="Open Anchored Reference"
                  icon={Icon.Link}
                  url={note.referenceUrl}
                  shortcut={{ modifiers: ["cmd", "shift"], key: "return" }}
                />
              ) : null}
              <Action
                title="Copy Note Text"
                icon={Icon.Clipboard}
                shortcut={{ modifiers: ["cmd"], key: "c" }}
                onAction={async () => {
                  await Clipboard.copy(note.body);
                  await showToast({ style: Toast.Style.Success, title: "Copied note text" });
                }}
              />
              <Action
                title="Reload Notes"
                icon={Icon.ArrowClockwise}
                shortcut={{ modifiers: ["cmd"], key: "r" }}
                onAction={() => revalidate()}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
