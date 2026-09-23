#!/usr/bin/env python3
"""Adds the "merge your own PRs" rule to a CLAUDE.md, once.

Usage: merge_rule.py IN OUT
  IN may be missing or empty (no CLAUDE.md yet). Writes the updated text to
  OUT and exits 0, or exits 2 without writing if the rule is already there.

Cloud chats only read the CLAUDE.md inside each repo, so install.sh runs this
over every repo in repos.txt (and over ~/.claude/CLAUDE.md for local chats).
Claude can't push this change itself: its safety check refuses a session
granting itself merge rights. Isaiah running the installer is the approval.
"""

import os
import re
import sys

MARKER = "Merge your own PRs"
RULE = (
    "- **Merge your own PRs.** Once CI is green (or the repo has no CI) and "
    "there's no merge conflict, squash-merge the PR and delete its branch — "
    "don't wait for Isaiah; he doesn't review PRs after a change has been "
    "talked through. Never merge on red CI; fix it or say what's blocking.\n"
)


def add_rule(text: str) -> str | None:
    if MARKER in text:
        return None
    lines = text.splitlines(True)
    # Prefer the first heading about git: add the rule to the end of its list.
    for i, line in enumerate(lines):
        if line.startswith("#") and re.search(r"\bgit\b", line, re.I):
            j = i + 1
            if j < len(lines) and not lines[j].strip():
                j += 1
            while j < len(lines) and (
                lines[j].lstrip().startswith(("-", "*"))
                or (lines[j].startswith("  ") and lines[j].strip())
            ):
                j += 1
            lines.insert(j, RULE)
            return "".join(lines)
    if text and not text.endswith("\n"):
        text += "\n"
    return text + ("\n" if text else "") + "# Merging\n\n" + RULE


def main() -> int:
    src, dst = sys.argv[1], sys.argv[2]
    text = open(src, encoding="utf-8").read() if os.path.exists(src) else ""
    new = add_rule(text)
    if new is None:
        return 2
    with open(dst, "w", encoding="utf-8") as f:
        f.write(new)
    return 0


if __name__ == "__main__":
    sys.exit(main())
