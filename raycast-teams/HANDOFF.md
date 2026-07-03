# Handoff — MS Teams Quick Chat (Raycast extension)

This is a working note for continuing development of the extension in a **new local Claude Code session**. Read it top to bottom; it's the fastest way to get oriented.

## What this project is

A **Raycast extension** that lets you search saved Microsoft Teams chats and start new ones — **with no sign-in, OAuth, client ID/secret, or API key**. The official Teams extension requires an Azure app registration ("security key"); this one avoids all of that because it never calls the Microsoft Graph API.

**How it works instead:** it builds a Teams *deep link* — a normal URL Teams already knows how to open — and hands it to the app:

```
1:1:    https://teams.microsoft.com/l/chat/0/0?users=alex@contoso.com
group:  https://teams.microsoft.com/l/chat/0/0?users=alex@contoso.com,sam@contoso.com&topicName=Trip
```

Opening an existing chat and "starting" a new one are the same URL — Teams reuses the existing conversation, so there are never duplicates. The desktop variant swaps the prefix to `msteams:/l/…`.

**The one inherent limitation:** because there is no sign-in, it can't read live Teams history. "Search" is over a list the user builds inside Raycast (stored locally). This is by design and is the whole point (no security key). Don't try to "fix" it by adding Graph auth unless the user explicitly asks.

## Where it lives

- Repo: `BarkernotBob/BarkernotBob.github.io` (a Quartz website repo; this extension is just one folder in it).
- Extension folder: **`raycast-teams/`** — everything for the extension is here.
- Default branch: **`v5`** (not `main`).

## Current status (as of this handoff)

- **PR #65 — MERGED.** Initial extension: `Search Teams Chats` + `New Teams Chat` commands.
- **PR #67 — OPEN.** Adds the `Import People` bulk-add command (branch `claude/raycast-ms-teams-extension-8cqzhv`). If it hasn't merged yet, this branch is where the newest code is. If it has merged, pull `v5`.

To get the newest code locally:
```
git checkout v5 && git pull            # once PR #67 is merged
# or, before it merges:
git fetch origin && git checkout claude/raycast-ms-teams-extension-8cqzhv
```

## File map (`raycast-teams/`)

| File | Responsibility |
| --- | --- |
| `src/teams.ts` | Pure logic + storage. Deep-link builders (`webChatLink`, `desktopChatLink`, `preferredChatLink`), `Contact` type, LocalStorage CRUD (`loadContacts`, `upsertContact`, `deleteContact`, `togglePinned`, `markUsed`), and bulk import (`parseContacts`, `bulkAddContacts`). **Start here** — the UI files are thin wrappers over this. |
| `src/search-chats.tsx` | `Search Teams Chats` command. A `<List>` with pinned/other sections, live filter, ad-hoc "start a chat with a typed email" row, and the per-item action panel. |
| `src/new-chat.tsx` | `New Teams Chat` command. A `<Form>` for 1:1/group chats; also reused (pushed) for editing an existing chat. |
| `src/import-people.tsx` | `Import People` command. A `<Form>` that parses a pasted blob and bulk-adds; shows a live "Detected" preview. |
| `package.json` | Raycast manifest: the three `commands`, the `defaultClient` preference, deps, and scripts. Adding a command = add an entry here **and** a matching `src/<name>.tsx`. |
| `assets/command-icon.png` | 512×512 icon. Regenerate with the script noted below if you want to change it. |
| `README.md` | User-facing install + usage (written for a Git/CLI beginner). |

Data model: a `Contact` is `{ id, name, emails[], topicName?, pinned?, lastUsed? }`. One email = 1:1 chat; multiple = group. Everything persists under the LocalStorage key `teams-contacts` (see `STORAGE_KEY`), on the user's Mac only.

## How to build / run / check

From inside `raycast-teams/`:

```
npm install         # first time only
npm run dev         # registers the commands in Raycast + hot-reloads; leave running while developing
npm run build       # ray build -e dist — compiles AND typechecks (this is the real "does it compile" gate)
npm run lint        # ray lint — ESLint + prettier + manifest validation
npx prettier --write 'src/**/*.{ts,tsx}'   # autoformat
```

`npm run dev` is the loop: keep it running, edit a file, Raycast reloads the command instantly.

## Gotchas / things that will bite you

1. **React types must be 19, not 18.** `@raycast/api` (v1.83+) pulls in React 19. `devDependencies` pins `@types/react` to `19.x` on purpose. If you ever see a wall of `Type 'bigint' is not assignable to type 'ReactNode'` errors, it's a React 17/18 vs 19 `@types/react` mismatch — fix the version, don't touch the JSX.
2. **`ray lint` shows an author-validation network error in some sandboxes** ("forbidden / Host not initialized"). That's only a *publish-to-store* check reaching Raycast's servers; it doesn't affect building or running locally. Ignore it for local dev.
3. **The 2 title-case ESLint warnings** on the "Open in Teams (Web/Desktop App)" actions are cosmetic (Raycast prefers Title Case for action titles). Harmless; leave or reword if you care.
4. **Prettier config:** formatting currently follows the *repo-root* `.prettierrc` (no semicolons, double quotes). Keep new code in that style so diffs stay clean; run the prettier command above before committing.
5. **Icon has no binary tooling.** There's no ImageMagick/PIL/canvas in the build env — the icon was generated by a small Node+zlib script that writes a PNG by hand. If you want a new icon, either drop in a 512×512 PNG at `assets/command-icon.png` or ask Claude to regenerate one the same way.
6. **Deep-link format is load-bearing.** `chat/0/0?users=<comma-separated emails>`; group name via `&topicName=`; prefilled message via `&message=`. Desktop = replace `https://teams.microsoft.com/l/` with `msteams:/l/`. Don't URL-encode the commas between users.

## Good next steps / ideas (not yet built)

- **Export / edit the whole list** (e.g. dump all saved chats to text, or an "Edit raw JSON" escape hatch).
- **Group-chat import** (current import only creates 1:1s).
- **Import from a file** (pick a `.csv`/`.txt`) in addition to paste.
- **A "Call" action** (`l/call/0/0?users=…`) alongside "Open chat".
- **Publish to the Raycast store** so it installs without `npm run dev` — needs a valid Raycast author handle and passing `ray lint` (`npm run publish`).

## Continuing in a fresh local Claude session

1. Open a terminal in the repo root (the folder that contains `raycast-teams/`).
2. Run `claude` to start Claude Code.
3. Point it here: *"Read raycast-teams/HANDOFF.md and the files in raycast-teams/src, then help me continue."*
4. Tell it what you want next (one of the ideas above, or your own).

That's everything. The logic is small and lives almost entirely in `src/teams.ts`; the three `.tsx` files are thin UI on top of it.
