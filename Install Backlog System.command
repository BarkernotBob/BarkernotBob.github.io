#!/bin/zsh
# Double-click this ONCE to set up the backlog system, and again any time you
# add a repo to backlog/repos.txt.
#
# It gives every project the two "what do you want changed" forms you'll see on
# your phone, plus the labels the board uses. It does not touch your code.

cd "$(dirname "$0")" || exit 1

echo "Setting up the backlog system on your GitHub projects..."
echo ""

/bin/sh backlog/install.sh
status=$?

echo ""
if [ $status -eq 0 ]; then
  echo "All set. On your phone, open the GitHub app, pick a project,"
  echo "tap Issues, tap the + button, and you'll see the two new forms."
fi

echo ""
echo "Press Return to close this window."
read
