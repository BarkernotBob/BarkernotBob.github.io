#!/bin/zsh
# Double-click this file to PUBLISH your latest notes to your live website.
# It saves your changes and sends them to GitHub, which rebuilds the public
# site at https://isaiahmail97-oss.github.io (this usually takes 1-2 minutes).

cd "$(dirname "$0")" || exit 1

echo "Publishing your changes to the website..."
echo ""

# 1. Get any changes that were made elsewhere (e.g. on the website editor)
#    so your computer is up to date first. This avoids conflicts.
echo "Step 1 of 3: Checking for any newer changes online..."
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

# 2. Save (commit) everything you've changed locally.
echo ""
echo "Step 2 of 3: Saving your changes..."
git add -A
if git diff --cached --quiet; then
  echo "Nothing new to publish — your website is already up to date."
else
  git commit -m "Update notes"
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
  echo "⚠️  Couldn't send the changes. Check your internet connection,"
  echo "    or ask Claude for help."
fi

echo ""
echo "Press Return to close this window."
read
