#!/bin/zsh
# Double-click this file to pull down everything you've planned across all your
# projects and write it into BACKLOG.md, then open it.
#
# Nothing you type into BACKLOG.md is saved anywhere. It's a read-only snapshot.
# To change an item, change the issue on GitHub and run this again.

cd "$(dirname "$0")" || exit 1

echo "Reading your planned changes from GitHub..."
echo ""

if python3 backlog/backlog.py; then
  echo ""
  open BACKLOG.md 2>/dev/null
else
  echo ""
  echo "Something went wrong - the messages above say what."
fi

echo ""
echo "Press Return to close this window."
read
