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

# --- Pull in the latest game/app builds so the preview always shows your newest
# --- versions. AUTO-DISCOVERY: any file named "*.standalone.html" anywhere inside
# --- your Claude folder is picked up automatically — no need to list it here. To add
# --- a new game, just save it as "<Name>.standalone.html" in that folder.
GAME_SRC_ROOT="$HOME/Library/Mobile Documents/iCloud~md~obsidian/Documents/KnoxLox/Claude"
if [ -d "$GAME_SRC_ROOT" ]; then
  for src in "$GAME_SRC_ROOT"/**/*.standalone.html(N); do
    base="${src:t:r}"; base="${base%.standalone}"; base="${base// /-}"  # "My Game.standalone.html" -> "My-Game"
    dst="quartz/static/${base}.html"
    if ! cmp -s "$src" "$dst" 2>/dev/null; then
      cp "$src" "$dst" && echo "Updated ${base} to your latest version."
    fi
  done
else
  echo "Note: couldn't find your Claude games folder (it may still be syncing) —"
  echo "      showing whatever is already in the site folder."
fi

# Special cases: games whose source file ISN'T named "*.standalone.html".
# Format per line: "<full path to the source file>|<Name>.html".
GAMES=(
  "$HOME/Library/Mobile Documents/iCloud~md~obsidian/Documents/KnoxLox/Claude/Claude.Tax Modeling/Tax Modeler.html|Tax-Modeler.html"
)
for entry in "${GAMES[@]}"; do
  src="${entry%%|*}"; dst="quartz/static/${entry##*|}"; name="${dst:t:r}"
  if [ -f "$src" ] && ! cmp -s "$src" "$dst" 2>/dev/null; then
    cp "$src" "$dst" && echo "Updated the ${name} to your latest version."
  fi
done

# --- Auto-create a menu launcher for any standalone app/game in quartz/static.
# --- Drop an .html file into quartz/static and a matching menu page appears
# --- that jumps straight into it full-screen. Existing pages are never touched.
SITE_ORIGIN="https://barkernotbob.github.io"
# Which menu folder each app belongs in (default: games). Add a line per new app.
typeset -A LAUNCH_FOLDER
LAUNCH_FOLDER=(Blockchain games Hexchain games BallChain games Dodecachain games Tax-Modeler tools)
for f in quartz/static/*.html(N); do
  fname="${f:t}"; base="${f:t:r}"
  folder="${LAUNCH_FOLDER[$base]:-games}"
  note="content/${folder}/${base}.md"
  if [ ! -f "$note" ]; then
    mkdir -p "content/${folder}"
    cat > "$note" <<EOF
---
title: ${base}
publish: true
---

Loading **${base}**… if it doesn't open automatically, <a href="${SITE_ORIGIN}/static/${fname}" data-static-redirect="/static/${fname}" data-router-ignore>click here</a>.
EOF
    echo "Created a menu launcher for ${fname} in ${folder}/."
  fi
done

# Small plugin tweaks applied before each build:
#  - search matches within words (substring), not just word-starts
#  - the file-tree explorer slides over as a drawer at all screen sizes
sed -i '' 's/tokenize:"forward"/tokenize:"full"/g' \
  .quartz/plugins/search/dist/index.js \
  .quartz/plugins/search/dist/components/index.js 2>/dev/null
sed -i '' 's/max-width: *800px/max-width: 99999px/g' \
  .quartz/plugins/explorer/dist/index.js \
  .quartz/plugins/explorer/dist/components/index.js 2>/dev/null

#  - teach plugins to honor the `order:` frontmatter field (list pages + sidebar).
#    Idempotent; mirrors the same step in .github/workflows/deploy.yml. See QUARTZ_GUIDE.md.
node patch-plugins.mjs 2>/dev/null

echo "Building your website and starting the preview..."
echo "When you see a web address (http://localhost:8080), it's ready."
echo ""

# Start the local preview server in the background.
npx quartz build --serve &
SERVER_PID=$!

# Give it a few seconds to start, then open the side-by-side (desktop + phone)
# preview in your browser. It has an "Open full size" link if you want just one.
sleep 5
open "design/side-by-side-preview.html"

echo ""
echo "Preview is running. Leave this window open while you look at the site."
echo "Close this window (or press Control + C) when you're done."

# Keep the script alive until the server stops.
wait $SERVER_PID
