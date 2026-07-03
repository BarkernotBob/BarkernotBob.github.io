# MS Teams Quick Chat (Raycast)

Search your saved Microsoft Teams chats and start new ones straight from Raycast — then Teams opens on the right conversation.

**No security key, no sign-in, no API.** The official Teams extension makes you register an app and paste a client ID/secret. This one doesn't, because it never talks to Microsoft's servers. Instead it builds a _Teams deep link_ — a normal `https://teams.microsoft.com/...` URL that Teams already knows how to open — and hands it to the app. That's the trade-off worth knowing up front (see [Limitations](#limitations)).

## What you get

Two Raycast commands:

| Command                | What it does                                                                                                                                                                |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Search Teams Chats** | A searchable list of chats you've saved. Pick one and it opens in Teams. Type a full email that isn't saved yet and it offers to start a chat with that person on the spot. |
| **New Teams Chat**     | A form to start a one-on-one or group chat. Add one email for a direct chat, or several for a group. Optionally saves it to your list for next time.                        |
| **Import People**      | Bulk-add your whole org at once — paste a big list of email addresses and each person becomes a saved one-on-one chat. See [Bulk import](#bulk-import).                     |

## Limitations (read this first)

Because there's no sign-in, the extension **cannot read your actual Teams chat history**. "Search" means searching the list _you_ build inside Raycast — not a live view of every conversation in Teams. In practice you save the people you message often once, and after that it's a two-keystroke jump into any of them.

Everything else works with zero setup: opening a saved chat, starting a new one, group chats, and pre-filling a first message.

## Install it (one time)

You'll do this in the **Terminal** app. Copy each block, paste it, press **Return**, wait for it to finish before the next.

### 1. Make sure you have Node.js

Type this and press Return:

```
node --version
```

If it prints a version number (like `v20.x`), you're set — skip to step 2. If it says "command not found", install it:

```
brew install node
```

(No `brew`? Install it first from https://brew.sh, then run the line above.)

### 2. Go into this folder and install

In Terminal, type `cd ` (with a space after `cd`), then **drag this `raycast-teams` folder from Finder onto the Terminal window** and press Return. That moves Terminal into the folder. Then:

```
npm install
```

Let it finish (a minute or two the first time).

### 3. Turn it on in Raycast

```
npm run dev
```

Raycast opens and the two commands appear immediately. **Leave this Terminal window running** while you use them.

That's it. Open Raycast (default: **⌥ Space**) and type **Search Teams Chats** or **New Teams Chat**.

> **Keeping it installed for good:** once you've run `npm run dev` at least once, the commands stay in Raycast's list. If they disappear after a Mac restart, run `npm run dev` again from this folder. (Publishing it into Raycast permanently is possible later with `npm run build` — ask if you want to.)

## Using it

- **Open a saved chat:** type **Search Teams Chats**, find the person, press **Return**. Teams opens on that conversation.
- **Message someone new:** in Search Teams Chats, type their full email (e.g. `alex@contoso.com`). A "Start a new chat" row appears — press **Return** to jump into Teams, or **⌘S** to save them first.
- **Start a group chat:** run **New Teams Chat**, put several emails in Recipients separated by commas, give it a Group Name, press **Return**.
- **Pre-fill a message:** in New Teams Chat, type into "First Message". Teams drops it into the box for you — you still press Send.

### Bulk import

Run **Import People** (or press **⌘I** from the search list) to add lots of people at once.

Paste a list of email addresses into the box — the format is forgiving, so most copy-pastes just work:

- plain emails, comma- or newline-separated: `alex@contoso.com, sam@contoso.com`
- address-book style: `Jordan Lee <jordan@contoso.com>`
- a column copied straight out of Excel/Sheets (name in one column, email in the next)

As you paste, the form shows a live **Detected** count and a preview so you can check it looks right, then press **Return** to import. Each person becomes a one-on-one chat. Names are used when present, otherwise made from the email (so `jordan.lee@…` shows as "Jordan Lee"). Anyone already in your list is skipped, so re-pasting is safe.

> **Where to get the list:** in Outlook you can open a distribution list / team and copy the members, or paste the "To" line of an email that went to the group. Any text with emails in it works — the importer picks out the addresses and ignores the rest.

### Handy keys (inside a chat's ⌘K actions)

| Key        | Action                                           |
| ---------- | ------------------------------------------------ |
| **Return** | Open in Teams (uses your default — see Settings) |
| **⌘W**     | Force open in the **web** version                |
| **⌘⇧D**    | Force open in the **desktop app**                |
| **⌘E**     | Edit a saved chat                                |
| **⌘⇧P**    | Pin / unpin (pinned float to the top)            |
| **⌘C**     | Copy the Teams link                              |
| **⌘I**     | Import People (bulk add from a pasted list)      |
| **⌃X**     | Delete from your list (doesn't touch Teams)      |

## Settings

Raycast Settings → Extensions → **MS Teams Quick Chat** → **Open chats in**:

- **Web** (default) — always works; opens `teams.microsoft.com`, which then offers to hand off to the desktop app.
- **Desktop app** — opens the installed Teams app directly. Choose this if you always use the app.

You can override per-open anytime with ⌘W (web) or ⌘⇧D (desktop).

## How it works (for the curious)

A direct chat link looks like:

```
https://teams.microsoft.com/l/chat/0/0?users=alex@contoso.com
```

A group chat adds more users and an optional name:

```
https://teams.microsoft.com/l/chat/0/0?users=alex@contoso.com,sam@contoso.com&topicName=Weekend%20Trip
```

Opening an existing chat and "starting" a new one are the **same link** — Teams reuses the existing conversation if there is one, so you never end up with duplicates. Your saved list lives on your Mac only (Raycast local storage); nothing is uploaded anywhere.
