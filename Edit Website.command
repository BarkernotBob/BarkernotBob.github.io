#!/bin/zsh
# Double-click this file to EDIT your website.
#
# It opens your real site in a browser with an editing layer on top: click any
# paragraph to change it, add or move pages, edit tags, and press Publish when
# you're happy. Nothing goes live until you press Publish.
#
# To stop editing: close this Terminal window, or press Control + C.

cd "$(dirname "$0")" || exit 1
export PATH="$HOME/.local/node/bin:$PATH"

QUARTZ_PORT=8080
STUDIO_PORT=8081

cleanup() {
  echo ""
  echo "Shutting down the editor..."
  [ -n "$QUARTZ_PID" ] && kill $QUARTZ_PID 2>/dev/null
  [ -n "$STUDIO_PID" ] && kill $STUDIO_PID 2>/dev/null
  exit 0
}
trap cleanup INT TERM

# --- The website's engine lives in "node_modules.nosync" (the ".nosync" ending
# --- keeps iCloud from deleting parts of it). "node_modules" is a shortcut to
# --- it. If either is missing or broken, rebuild automatically.
if [ ! -L node_modules ] || [ ! -e "node_modules/preact/package.json" ]; then
  echo "Setting up the website engine (this can take up to a minute)..."
  if [ -L node_modules ]; then rm -f node_modules
  elif [ -e node_modules ]; then mv node_modules "node_modules.old.$$" 2>/dev/null || rm -rf node_modules; fi
  if [ ! -e "node_modules.nosync/preact/package.json" ]; then
    rm -rf node_modules.nosync 2>/dev/null
    npm install --no-audit --no-fund || { echo "Setup failed — ask Claude for help."; echo "Press Return to close."; read; exit 1; }
    mv node_modules node_modules.nosync
  fi
  ln -s node_modules.nosync node_modules
  rm -rf node_modules.old.*(N) 2>/dev/null &
fi

# --- Free the ports if a previous session left something behind.
for port in $QUARTZ_PORT $STUDIO_PORT; do
  pids=$(lsof -ti:$port 2>/dev/null)
  if [ -n "$pids" ]; then
    echo "Closing a leftover preview on port $port..."
    echo "$pids" | xargs kill -9 2>/dev/null
    sleep 1
  fi
done

# --- Same plugin tweaks the Preview script applies, so editing looks exactly
# --- like the published site (substring search; explorer drawer at all widths).
# --- Must stay in sync with .github/workflows/deploy.yml. See CLAUDE.md.
sed -i '' 's/tokenize:"forward"/tokenize:"full"/g' \
  .quartz/plugins/search/dist/index.js \
  .quartz/plugins/search/dist/components/index.js 2>/dev/null
sed -i '' 's/max-width: *800px/max-width: 99999px/g' \
  .quartz/plugins/explorer/dist/index.js \
  .quartz/plugins/explorer/dist/components/index.js 2>/dev/null
node patch-plugins.mjs 2>/dev/null

echo "Starting your website..."
npx quartz build --serve --port $QUARTZ_PORT >/tmp/studio-quartz.log 2>&1 &
QUARTZ_PID=$!

echo "Starting the editor..."
npx tsx studio/server.mts &
STUDIO_PID=$!

# --- Wait for the editor to answer before opening the browser.
for i in {1..40}; do
  if curl -sf "http://127.0.0.1:$STUDIO_PORT/__studio/overlay.css" >/dev/null 2>&1; then break; fi
  sleep 0.5
done

echo ""
echo "✅ Your website editor is open at http://localhost:$STUDIO_PORT"
echo ""
echo "   • Click 'Edit' (bottom right), then click any paragraph to change it."
echo "   • 'Page' changes the title, tags, folder, or deletes the page."
echo "   • 'New' adds a page.  'Publish' sends everything to the live site."
echo ""
echo "Leave this window open while you're editing."
echo "Close it (or press Control + C) when you're done."

open "http://localhost:$STUDIO_PORT"

wait $STUDIO_PID
