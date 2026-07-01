#!/bin/zsh
# ============================================================
# Import / re-sync your Logos notes into your Obsidian vault.
# Double-click this file to run it.
#
# What it does:
#   1. Finds your active Logos notes database automatically.
#   2. Converts every text note (not highlights) to Markdown.
#   3. Writes them into <your vault>/Logos, organized by book,
#      with clickable ref.ly Bible references and downloaded images.
#   4. Re-running is safe: notes are matched by a hidden logos_id,
#      so existing notes are updated in place (no duplicates).
#      Notes you created directly in Obsidian are never touched.
# ============================================================

DIR="${0:A:h}"   # the folder this script lives in

# Need Python 3 (preinstalled on most Macs; if missing, macOS offers to install it).
if ! command -v python3 >/dev/null 2>&1; then
  echo "ERROR: python3 was not found on this Mac."
  echo "Open Terminal, run 'python3 --version', and macOS will offer to install the"
  echo "Command Line Tools. Accept it, wait for it to finish, then run this again."
  echo; echo "Press Return to close."; read _; exit 1
fi

# Quit Logos/Verbum first so the notes database is a complete, consistent snapshot.
echo "Quitting Logos (if open) so its notes are fully saved..."
osascript -e 'quit app "Logos"'  >/dev/null 2>&1 || true
osascript -e 'quit app "Verbum"' >/dev/null 2>&1 || true
sleep 2

echo "Looking for your Logos notes database..."
# Pick the LARGEST notestool.db (that's your main account)
DB=$(find "$HOME/Library/Application Support/Logos4/Documents/"*/NotesToolManager/notestool.db 2>/dev/null \
      | while read -r f; do echo "$(stat -f%z "$f") $f"; done \
      | sort -rn | head -1 | cut -d' ' -f2-)

if [[ -z "$DB" ]]; then
  echo "ERROR: Could not find a Logos notes database."
  echo "Is Logos installed on this Mac? (If you use Verbum, edit this script and"
  echo "change 'Logos4' to 'Verbum'.)"
  echo; echo "Press Return to close."; read _; exit 1
fi
echo "  Using: $DB"
echo

# Ask where your Obsidian vault is (press Return to accept the default).
# Tip: change the folder name below to your own vault so you can just press Return.
DEFAULT_VAULT="$HOME/ObsidianVault"
echo "Where is your Obsidian vault? (the folder that contains your notes)"
read "VAULT?Vault path [$DEFAULT_VAULT]: "
VAULT=${VAULT:-$DEFAULT_VAULT}

if [[ ! -d "$VAULT" ]]; then
  echo "ERROR: '$VAULT' is not a folder. Run again and paste the correct path."
  echo; echo "Press Return to close."; read _; exit 1
fi

echo
echo "Converting notes into: $VAULT/Logos"
if ! python3 "$DIR/logos_to_md.py" "$DB" "$VAULT"; then
  echo
  echo "ERROR: the import did not finish. Make sure Logos is fully quit, then try again."
  echo "If it keeps failing, copy the message above and send it for help."
  echo; echo "Press Return to close."; read _; exit 1
fi

echo
echo "Done. Open Obsidian and look in the 'Logos' folder."
echo "Press Return to close."
read _
