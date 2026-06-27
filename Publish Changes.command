#!/bin/zsh
# Double-click this file to PUBLISH your latest notes to your live website.
# It saves your changes and sends them to GitHub, which rebuilds the public
# site at https://barkernotbob.github.io (this usually takes 1-2 minutes).

cd "$(dirname "$0")" || exit 1

echo "Publishing your changes to the website..."
echo ""

# 0. Pull in the latest game builds from your folders so the newest versions get
#    published. (If a game file isn't found, we keep the current one and carry on.)
#    To add a future game, copy one line below: "<where the game file lives>|<Name>.html".
GAMES=(
  "$HOME/Library/Mobile Documents/iCloud~md~obsidian/Documents/KnoxLox/Claude/Claude.Blockchain/Blockchain.standalone.html|Blockchain.html"
  "$HOME/Library/Mobile Documents/iCloud~md~obsidian/Documents/KnoxLox/Claude/Claude.Blockchain/Hexchain.standalone.html|Hexchain.html"
  "$HOME/Library/Mobile Documents/iCloud~md~obsidian/Documents/KnoxLox/Claude/Claude.Blockchain/BallChain.standalone.html|BallChain.html"
  "$HOME/Library/Mobile Documents/iCloud~md~obsidian/Documents/KnoxLox/Claude/Claude.Tax Modeling/Tax Modeler.html|Tax-Modeler.html"
)
for entry in "${GAMES[@]}"; do
  src="${entry%%|*}"; dst="quartz/static/${entry##*|}"; name="${dst:t:r}"
  if [ -f "$src" ]; then
    if ! cmp -s "$src" "$dst" 2>/dev/null; then
      cp "$src" "$dst" && echo "Picked up your latest ${name} game."
    fi
  else
    echo "Note: couldn't find your ${name} game file (it may still be syncing) —"
    echo "      publishing the version already in the site folder."
  fi
done

# 0b. Auto-create a menu launcher for any standalone app/game in quartz/static.
#     Drop an .html file into quartz/static and a matching menu page appears
#     that jumps straight into it full-screen. Existing pages are never touched.
SITE_ORIGIN="https://barkernotbob.github.io"
# Which menu folder each app belongs in (default: games). Add a line per new app.
typeset -A LAUNCH_FOLDER
LAUNCH_FOLDER=(Blockchain games Hexchain games BallChain games Tax-Modeler tools)
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
  echo "   https://barkernotbob.github.io"
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
