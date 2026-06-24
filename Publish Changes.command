#!/bin/zsh
# Double-click this file to PUBLISH your latest notes to your live website.
# It saves your changes and sends them to GitHub, which rebuilds the public
# site at https://isaiahmail97-oss.github.io (this usually takes 1-2 minutes).

cd "$(dirname "$0")" || exit 1

echo "Publishing your changes to the website..."
echo ""

# 0. Pull in the latest blockchain game from your Obsidian vault so the newest
#    version gets published. (If the vault file isn't found, we keep the current
#    one and carry on.)
GAME_SRC="$HOME/Library/Mobile Documents/iCloud~md~obsidian/Documents/KnoxLox/Claude/Claude.Blockchain/Blockchain.standalone.html"
GAME_DST="quartz/static/Blockchain.html"
if [ -f "$GAME_SRC" ]; then
  if ! cmp -s "$GAME_SRC" "$GAME_DST" 2>/dev/null; then
    cp "$GAME_SRC" "$GAME_DST" && echo "Picked up your latest blockchain game."
  fi
else
  echo "Note: couldn't find your game file in the vault (it may still be syncing) —"
  echo "      publishing the version already in the site folder."
fi

# 0b. Auto-create a menu launcher for any standalone app/game in quartz/static.
#     Drop an .html file into quartz/static and a matching menu page appears
#     that jumps straight into it full-screen. Existing pages are never touched.
SITE_ORIGIN="https://isaiahmail97-oss.github.io"
for f in quartz/static/*.html(N); do
  fname="${f:t}"; base="${f:t:r}"
  note="content/${base}.md"
  if [ ! -f "$note" ]; then
    cat > "$note" <<EOF
---
title: ${base}
publish: true
---

Loading **${base}**… if it doesn't open automatically, <a href="${SITE_ORIGIN}/static/${fname}" data-static-redirect="/static/${fname}" data-router-ignore>click here</a>.
EOF
    echo "Created a menu launcher for ${fname}."
  fi
done
echo ""

# 1. Save (commit) everything you've changed locally FIRST. Git won't let us
#    sync with the online copy while there are unsaved changes lying around.
echo "Step 1 of 3: Saving your changes..."
git add -A
if git diff --cached --quiet; then
  echo "  Nothing new since last time — checking the online copy anyway."
else
  git commit -m "Update notes"
  echo "  Saved."
fi

# 2. Combine with any newer changes made elsewhere (e.g. GitHub's web editor).
echo ""
echo "Step 2 of 3: Checking for any newer changes online..."
if ! git pull --rebase; then
  echo ""
  echo "⚠️  Couldn't automatically combine your changes with the online ones."
  echo "    This can happen if the same note was edited in two places."
  echo "    Don't worry — nothing is lost. Ask Claude for help to sort it out."
  echo ""
  echo "Press Return to close this window."
  read
  exit 1
fi

# 3. Send the saved changes up to GitHub (this triggers the website rebuild).
echo ""
echo "Step 3 of 3: Sending changes to GitHub..."
if git push; then
  echo ""
  echo "✅ Done! Your changes are on their way."
  echo "   Your live site will update in about 1-2 minutes:"
  echo "   https://isaiahmail97-oss.github.io"
else
  echo ""
  echo "⚠️  Couldn't send the changes to GitHub."
  echo "    If this is your first time, you probably need to log in once. Open a"
  echo "    NEW Terminal window and run this command, then follow the prompts:"
  echo ""
  echo "        gh auth login -h github.com -p https -w"
  echo ""
  echo "    After logging in, just run this Publish file again. Or ask Claude."
fi

echo ""
echo "Press Return to close this window."
read
