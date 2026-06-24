#!/bin/zsh
# Double-click this file to preview your website on THIS computer.
# It opens at http://localhost:8080 in your browser.
# Nothing here is published to the internet — this is just for you to look at.
# To stop the preview: close this Terminal window, or press Control + C.

# Move into the folder this script lives in.
cd "$(dirname "$0")" || exit 1

# Make sure the computer can find "node" (the program that runs Quartz).
export PATH="$HOME/.local/node/bin:$PATH"

# --- The website's engine files live in "node_modules.nosync". The ".nosync"
# --- ending tells iCloud to leave that folder completely alone (iCloud was
# --- deleting parts of it, which broke the preview). "node_modules" is just a
# --- shortcut pointing to it. If the shortcut or engine is missing/broken,
# --- this block rebuilds it automatically — you don't have to do anything.
if [ ! -L node_modules ] || [ ! -e "node_modules/preact/package.json" ]; then
  echo "Setting up the website engine (this can take up to a minute)..."
  # Clear whatever "node_modules" currently is (a broken shortcut or a folder).
  if [ -L node_modules ]; then rm -f node_modules
  elif [ -e node_modules ]; then mv node_modules "node_modules.old.$$" 2>/dev/null || rm -rf node_modules; fi
  # If the engine isn't already saved in node_modules.nosync, install it there.
  if [ ! -e "node_modules.nosync/preact/package.json" ]; then
    rm -rf node_modules.nosync 2>/dev/null
    npm install --no-audit --no-fund || { echo "Setup failed — ask Claude for help."; echo "Press Return to close."; read; exit 1; }
    mv node_modules node_modules.nosync
  fi
  # Point "node_modules" at the protected folder.
  ln -s node_modules.nosync node_modules
  # Tidy up any leftover backup folders ((N) = quietly do nothing if none exist).
  rm -rf node_modules.old.*(N) 2>/dev/null &
fi

# --- Pull in the latest blockchain game from your Obsidian vault, so the
# --- preview always shows your newest version. (If the vault file isn't found
# --- — e.g. iCloud is still syncing — we just use whatever's already here.)
GAME_SRC="$HOME/Library/Mobile Documents/iCloud~md~obsidian/Documents/KnoxLox/Claude/Claude.Blockchain/Blockchain.standalone.html"
GAME_DST="quartz/static/Blockchain.html"
if [ -f "$GAME_SRC" ]; then
  if ! cmp -s "$GAME_SRC" "$GAME_DST" 2>/dev/null; then
    cp "$GAME_SRC" "$GAME_DST" && echo "Updated the blockchain game to your latest version."
  fi
else
  echo "Note: couldn't find your game file in the vault (it may still be syncing) —"
  echo "      showing the version already in the site folder."
fi

echo "Building your website and starting the preview..."
echo "When you see a web address (http://localhost:8080), it's ready."
echo ""

# Start the local preview server in the background.
npx quartz build --serve &
SERVER_PID=$!

# Give it a few seconds to start, then open your browser automatically.
sleep 5
open "http://localhost:8080"

echo ""
echo "Preview is running. Leave this window open while you look at the site."
echo "Close this window (or press Control + C) when you're done."

# Keep the script alive until the server stops.
wait $SERVER_PID
