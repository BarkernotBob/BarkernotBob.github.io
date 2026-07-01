#!/bin/bash

# Search the file contents of your locally-cloned repos with ripgrep.
# Fast, offline, no GitHub API rate limits.

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Search Local Code
# @raycast.mode fullOutput

# Optional parameters:
# @raycast.icon 🔎
# @raycast.packageName Dev Tools
# @raycast.argument1 { "type": "text", "placeholder": "search term" }
# @raycast.argument2 { "type": "text", "placeholder": "file glob (optional, e.g. *.ts)", "optional": true }

# Documentation:
# @raycast.description Search file contents across your local repos folder using ripgrep.
# @raycast.author BarkernotBob

# --- Configuration -----------------------------------------------------------
# Folder that holds your cloned repos. Override by setting RAYCAST_REPOS_DIR
# in Raycast (Script Commands > this command > add an environment variable),
# or edit the default below. First existing path in the list wins.
REPOS_DIR="${RAYCAST_REPOS_DIR:-}"
if [ -z "$REPOS_DIR" ]; then
  for candidate in "$HOME/code" "$HOME/Code" "$HOME/GitHub" "$HOME/Developer" "$HOME/dev" "$HOME/repos"; do
    if [ -d "$candidate" ]; then
      REPOS_DIR="$candidate"
      break
    fi
  done
fi
# -----------------------------------------------------------------------------

QUERY="$1"
GLOB="$2"

if ! command -v rg >/dev/null 2>&1; then
  echo "ripgrep (rg) is not installed."
  echo "Install it with:  brew install ripgrep"
  exit 1
fi

if [ -z "$QUERY" ]; then
  echo "Enter a search term."
  exit 1
fi

if [ -z "$REPOS_DIR" ] || [ ! -d "$REPOS_DIR" ]; then
  echo "No local repos folder found."
  echo "Set RAYCAST_REPOS_DIR to your repos directory, or create one of:"
  echo "  ~/code  ~/Code  ~/GitHub  ~/Developer  ~/dev  ~/repos"
  exit 1
fi

echo "Searching \"$QUERY\" in $REPOS_DIR"
[ -n "$GLOB" ] && echo "Filtered to files matching: $GLOB"
echo "----------------------------------------------------------------------"

RG_ARGS=(--line-number --heading --color never --smart-case --max-columns 200)
[ -n "$GLOB" ] && RG_ARGS+=(--glob "$GLOB")

# rg exits 1 when there are no matches; treat that as a clean "no results".
rg "${RG_ARGS[@]}" -- "$QUERY" "$REPOS_DIR"
STATUS=$?

if [ "$STATUS" -eq 1 ]; then
  echo "No matches."
elif [ "$STATUS" -gt 1 ]; then
  echo "ripgrep exited with an error (code $STATUS)."
  exit "$STATUS"
fi
