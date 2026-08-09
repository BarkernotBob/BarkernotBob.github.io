#!/usr/bin/env python3
"""Build a local BACKLOG.md from the planned-change issues in every repo.

Reads backlog/repos.txt, asks GitHub for the issues in each repo, and writes a
single markdown file grouped by project with Planned / In progress / Blocked /
Done sections.

Run it through "Backlog.command" (double-click) or directly:

    python3 backlog/backlog.py [--output PATH] [--done-days N]
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
REPOS_FILE = REPO_ROOT / "backlog" / "repos.txt"
DEFAULT_OUTPUT = REPO_ROOT / "BACKLOG.md"
DEFAULT_DONE_DAYS = 30

# `gh issue list` caps at 100 per page and pages up to this many. No repo here
# is anywhere near it, and the closed query is date-filtered server-side.
PAGE_LIMIT = 500

# Highest precedence first: an issue carrying several status labels is filed
# under the most urgent one rather than appearing twice. An open issue with
# none of these labels is a planned item — that is the whole point, filing
# something must never require remembering to tag it.
STATUS_ORDER = ["blocked", "hold", "in-progress"]

SECTION_TITLES = {
    "planned": "Planned",
    "in-progress": "In progress",
    "blocked": "Blocked",
    "hold": "On hold",
    "done": "Done",
}

# The order sections are printed in, most-needs-attention first.
SECTION_ORDER = ["blocked", "in-progress", "planned", "hold", "done"]


class GhError(RuntimeError):
    pass


def read_repos(path: Path) -> list[str]:
    if not path.exists():
        raise GhError(f"Can't find the repo list at {path}")
    repos = []
    for line in path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            repos.append(line)
    return repos


def gh_json(args: list[str]) -> list[dict]:
    result = subprocess.run(
        ["gh", *args], capture_output=True, text=True, check=False
    )
    if result.returncode != 0:
        raise GhError(result.stderr.strip() or "gh exited non-zero")
    try:
        return json.loads(result.stdout or "[]")
    except json.JSONDecodeError:
        # gh sometimes prints an upgrade notice or a login prompt on stdout.
        # One repo going strange must not take the whole report down.
        raise GhError("gh returned something that wasn't JSON")


def fetch_issues(repo: str, done_since: datetime) -> dict[str, list[dict]]:
    """Return the repo's issues bucketed by status."""
    fields = "number,title,url,labels,createdAt,updatedAt,closedAt,comments,stateReason"

    # Everything open is fetched in one call and bucketed by label below, so
    # this keeps working in repos where the labels haven't been created yet.
    open_issues = gh_json(
        ["issue", "list", "--repo", repo, "--state", "open",
         "--limit", str(PAGE_LIMIT), "--json", fields]
    )

    # Filtered by date on GitHub's side rather than locally, so a repo with
    # years of closed issues can't push the recent ones past the page limit.
    closed_issues = gh_json(
        ["issue", "list", "--repo", repo, "--state", "closed",
         "--search", f"closed:>={done_since.date().isoformat()}",
         "--limit", str(PAGE_LIMIT), "--json", fields]
    )

    buckets: dict[str, list[dict]] = {key: [] for key in SECTION_TITLES}

    for issue in open_issues:
        names = {label["name"] for label in issue["labels"]}
        bucket = next((s for s in STATUS_ORDER if s in names), "planned")
        buckets[bucket].append(issue)

    for issue in closed_issues:
        closed_at = issue.get("closedAt")
        if not closed_at:
            continue
        # "Closed as not planned" means abandoned, not shipped. Ticking those
        # off under Done would overstate what actually got built.
        if (issue.get("stateReason") or "").upper() == "NOT_PLANNED":
            continue
        if parse_time(closed_at) >= done_since:
            buckets["done"].append(issue)

    return buckets


def parse_time(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def age_in_days(value: str, now: datetime) -> int:
    return max((now - parse_time(value)).days, 0)


def format_issue(issue: dict, status: str, now: datetime) -> str:
    names = {label["name"] for label in issue["labels"]}
    tags = []
    if "needs-grilling" in names:
        tags.append("needs a conversation first")

    if status == "done":
        stamp = f"closed {age_in_days(issue['closedAt'], now)}d ago"
    elif status == "planned":
        stamp = f"filed {age_in_days(issue['createdAt'], now)}d ago"
    else:
        stamp = f"last touched {age_in_days(issue['updatedAt'], now)}d ago"
    tags.insert(0, stamp)

    comments = issue.get("comments")
    # gh returns comments as a list on some versions and a count on others.
    count = len(comments) if isinstance(comments, list) else (comments or 0)
    if count:
        tags.append(f"{count} note{'s' if count != 1 else ''}")

    checkbox = "x" if status == "done" else " "
    return (
        f"- [{checkbox}] [#{issue['number']}]({issue['url']}) {issue['title']}  \n"
        f"  _{' · '.join(tags)}_"
    )


def render(results: dict[str, dict[str, list[dict]]], now: datetime,
           done_days: int, errors: dict[str, str]) -> str:
    lines: list[str] = []
    lines.append("# Backlog")
    lines.append("")
    lines.append(
        f"_Generated {now.astimezone().strftime('%Y-%m-%d %H:%M')} by "
        "`Backlog.command`. Editing this file does nothing — "
        "change the issues on GitHub and run it again._"
    )
    lines.append("")

    totals = {key: 0 for key in SECTION_TITLES}
    for buckets in results.values():
        for key, issues in buckets.items():
            totals[key] += len(issues)

    lines.append("## Everything at a glance")
    lines.append("")
    columns = ["planned", "in-progress", "blocked", "hold", "done"]
    lines.append("| Project | " + " | ".join(SECTION_TITLES[c] for c in columns) + " |")
    lines.append("|---" + "|---:" * len(columns) + "|")
    for repo, buckets in results.items():
        if not any(buckets.values()):
            continue
        name = repo.split("/", 1)[1]
        counts = " | ".join(str(len(buckets[c])) for c in columns)
        lines.append(f"| [{name}](https://github.com/{repo}/issues) | {counts} |")
    totals_row = " | ".join(f"**{totals[c]}**" for c in columns)
    lines.append(f"| **Total** | {totals_row} |")
    lines.append("")
    lines.append(f"Done counts cover the last {done_days} days.")
    lines.append("")

    for repo, buckets in results.items():
        if not any(buckets.values()):
            continue
        lines.append("---")
        lines.append("")
        lines.append(f"## {repo.split('/', 1)[1]}")
        lines.append("")
        for key in SECTION_ORDER:
            issues = buckets[key]
            if not issues:
                continue
            lines.append(f"### {SECTION_TITLES[key]} ({len(issues)})")
            lines.append("")
            for issue in issues:
                lines.append(format_issue(issue, key, now))
            lines.append("")

    empty = [
        r for r, b in results.items() if not any(b.values()) and r not in errors
    ]
    if empty:
        lines.append("---")
        lines.append("")
        lines.append("## Nothing filed yet")
        lines.append("")
        lines.append(", ".join(r.split("/", 1)[1] for r in empty))
        lines.append("")

    if errors:
        lines.append("---")
        lines.append("")
        lines.append("## Couldn't read these")
        lines.append("")
        for repo, message in errors.items():
            lines.append(f"- **{repo}** — {message}")
        lines.append("")

    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--done-days", type=int, default=DEFAULT_DONE_DAYS)
    parser.add_argument("--repos-file", type=Path, default=REPOS_FILE)
    args = parser.parse_args()

    if shutil.which("gh") is None:
        print("The GitHub command line tool ('gh') isn't installed.")
        print("Install it with:  brew install gh")
        return 1

    now = datetime.now(timezone.utc)
    done_since = now - timedelta(days=args.done_days)

    try:
        repos = read_repos(args.repos_file)
    except GhError as error:
        print(error)
        return 1

    results: dict[str, dict[str, list[dict]]] = {}
    errors: dict[str, str] = {}

    for repo in repos:
        print(f"reading {repo} ...")
        try:
            results[repo] = fetch_issues(repo, done_since)
        except GhError as error:
            errors[repo] = str(error).splitlines()[0] if str(error) else "unknown error"
            results[repo] = {key: [] for key in SECTION_TITLES}

    args.output.write_text(render(results, now, args.done_days, errors))
    print(f"\nWrote {args.output}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
