#!/bin/sh
# Installs the backlog system into every repo listed in backlog/repos.txt:
#   - the five status labels (backlog/labels.json)
#   - the two issue forms (backlog/templates/*.yml)
#   - the /backlog Claude commands, into ~/.claude/commands
#
# Safe to run as many times as you like. It overwrites those files and the
# labels, and touches nothing else.

set -u

HERE=$(cd "$(dirname "$0")" && pwd)
REPOS_FILE="$HERE/repos.txt"
LABELS_JSON="$HERE/labels.json"
TEMPLATE_DIR="$HERE/templates"
COMMANDS_SRC="$HERE/../.claude/commands"
COMMANDS_DST="$HOME/.claude/commands"

# This repo keeps its own copies of the forms (they carry an extra "which part
# of the site" dropdown), so the generic ones must not clobber them.
SELF_REPO="BarkernotBob/BarkernotBob.github.io"

TAB=$(printf '\t')
failed=0

if ! command -v gh >/dev/null 2>&1; then
  echo "The GitHub command line tool ('gh') isn't installed."
  echo "Install it with:  brew install gh"
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "You're not signed in to GitHub on this computer."
  echo "Sign in with:  gh auth login"
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 isn't available, so the label list can't be read."
  exit 1
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# Flatten labels.json into tab-separated rows once, up front.
python3 -c '
import json, sys
for label in json.load(open(sys.argv[1])):
    print("\t".join([label["name"], label["color"], label["description"]]))
' "$LABELS_JSON" > "$work/labels.tsv" || {
  echo "Could not read $LABELS_JSON - is it valid JSON?"
  exit 1
}

# Upload a file to a repo through the GitHub API. Existing files need their
# current sha passed in, otherwise the API rejects the write as a conflict.
# Returns 2 when the remote copy already matches, so nothing gets committed.
put_file() {
  repo="$1"
  path="$2"
  local_file="$3"

  # An unreadable template would otherwise PUT empty content over a working
  # form and report success.
  content=$(base64 < "$local_file" | tr -d '\n') || return 1
  [ -n "$content" ] || return 1

  sha=$(gh api "repos/$repo/contents/$path" --jq .sha 2>/dev/null)

  if [ -n "$sha" ]; then
    remote=$(gh api "repos/$repo/contents/$path" --jq .content 2>/dev/null | tr -d '\n')
    if [ "$remote" = "$content" ]; then
      return 2
    fi
    gh api --method PUT "repos/$repo/contents/$path" \
      -f "message=Update the planned-change issue forms" \
      -f "content=$content" \
      -f "sha=$sha" >/dev/null 2>&1
  else
    gh api --method PUT "repos/$repo/contents/$path" \
      -f "message=Add the planned-change issue forms" \
      -f "content=$content" >/dev/null 2>&1
  fi
}

install_labels() {
  repo="$1"
  while IFS="$TAB" read -r name color description; do
    [ -n "$name" ] || continue
    if gh label create "$name" --repo "$repo" --color "$color" \
        --description "$description" --force >/dev/null 2>&1; then
      echo "    label: $name"
    else
      echo "    label: $name - FAILED"
      failed=1
    fi
  done < "$work/labels.tsv"
}

# Labels the system used to need and no longer does. An open issue with no
# status label is now a planned item, so `planned` and `nightly-ok` are just
# noise on the filing screen - and noise on that screen is what made items get
# filed wrong in the first place.
remove_stale_labels() {
  repo="$1"
  for stale in planned nightly-ok; do
    if gh label delete "$stale" --repo "$repo" --yes >/dev/null 2>&1; then
      echo "    label: $stale - removed, no longer used"
    fi
  done
}

install_forms() {
  repo="$1"
  for template in "$TEMPLATE_DIR"/*.yml; do
    base=$(basename "$template")
    put_file "$repo" ".github/ISSUE_TEMPLATE/$base" "$template"
    case $? in
      0) echo "    form:  $base" ;;
      2) echo "    form:  $base - already up to date" ;;
      *) echo "    form:  $base - FAILED" ; failed=1 ;;
    esac
  done
}

# Strip comments and blank lines so the loop below sees only repo names.
grep -v '^[[:space:]]*#' "$REPOS_FILE" | grep -v '^[[:space:]]*$' > "$work/repos.txt"

if [ ! -s "$work/repos.txt" ]; then
  echo "No repos listed in $REPOS_FILE - skipping the forms and labels."
else
  while IFS= read -r repo; do
    echo "=== $repo"

    if ! gh repo view "$repo" >/dev/null 2>&1; then
      echo "    SKIPPED - can't reach this repo (does it exist? do you have access?)"
      failed=1
      continue
    fi

    install_labels "$repo"
    remove_stale_labels "$repo"

    if [ "$repo" = "$SELF_REPO" ]; then
      echo "    forms: skipped (this repo keeps its own customised copies)"
    else
      install_forms "$repo"
    fi
  done < "$work/repos.txt"
fi

# Copying the commands to the home directory makes /backlog, /backlog-work and
# /backlog-grill work in every project, not just this one.
echo "=== Claude commands"
mkdir -p "$COMMANDS_DST"
for command_file in "$COMMANDS_SRC"/backlog*.md; do
  # An unmatched glob expands to the pattern itself, which is not a file.
  if [ ! -f "$command_file" ]; then
    echo "    none found in $COMMANDS_SRC - FAILED"
    failed=1
    break
  fi
  base=$(basename "$command_file" .md)
  if cp "$command_file" "$COMMANDS_DST/"; then
    echo "    /$base"
  else
    echo "    /$base - FAILED"
    failed=1
  fi
done

echo ""
if [ "$failed" -eq 0 ]; then
  echo "Done. Everything listed above is installed."
else
  echo "Done, but some steps failed - see the FAILED lines above."
fi

exit "$failed"
