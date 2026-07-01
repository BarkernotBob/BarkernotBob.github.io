#!/bin/bash

# Search file contents across ALL your GitHub repos (including private ones
# you can access) using the GitHub CLI. Works even when repos aren't cloned
# locally. Requires an authenticated `gh` (run `gh auth login` once).

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Search GitHub Code
# @raycast.mode fullOutput

# Optional parameters:
# @raycast.icon 🐙
# @raycast.packageName Dev Tools
# @raycast.argument1 { "type": "text", "placeholder": "search term" }
# @raycast.argument2 { "type": "text", "placeholder": "repo owner (optional)", "optional": true }

# Documentation:
# @raycast.description Search code across your GitHub repos with `gh search code`.
# @raycast.author BarkernotBob

# --- Configuration -----------------------------------------------------------
# Default owner to scope searches to. Override with RAYCAST_GH_OWNER, or pass
# an owner as the second argument in Raycast.
DEFAULT_OWNER="${RAYCAST_GH_OWNER:-BarkernotBob}"
# -----------------------------------------------------------------------------

QUERY="$1"
OWNER="${2:-$DEFAULT_OWNER}"

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI (gh) is not installed."
  echo "Install it with:  brew install gh"
  echo "Then sign in with: gh auth login"
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "GitHub CLI is not signed in."
  echo "Run this once in your terminal:  gh auth login"
  exit 1
fi

if [ -z "$QUERY" ]; then
  echo "Enter a search term."
  exit 1
fi

echo "Searching \"$QUERY\" across $OWNER repos on GitHub"
echo "----------------------------------------------------------------------"

# --owner scopes to your account/org. Bump --limit if you want more hits.
gh search code "$QUERY" --owner "$OWNER" --limit 50
STATUS=$?

if [ "$STATUS" -ne 0 ]; then
  echo "No matches (or the search hit a GitHub rate limit / error, code $STATUS)."
fi
