#!/usr/bin/env python3
"""PROTOTYPE — throwaway. Writes three Dev Hub design variants as real Obsidian notes
from snapshot.json (+ prs.json), so Isaiah can compare them on phone and desktop.

    python3 gen.py <vault-root>

Writes <vault-root>/Dev Hub prototype/{A - App, B - Sortable, C - Plain, D - Calm, E - Focus, F - Messages}/.
    python3 gen.py <vault-root> DEF   # only some variants
Not the real refresh: no change detection, no scheduling, no tests.
"""
import json, re, sys, urllib.parse
from datetime import datetime, timezone, timedelta
from pathlib import Path

HERE = Path(__file__).parent
ROOT_NAME = "Dev Hub prototype"
SNAP_TIME = datetime(2026, 10, 11, 21, 55, tzinfo=timezone(timedelta(hours=-4)))
PROJECTS_DIR = Path.home() / "Projects"

# Pretend labels so the prototype can show buckets that are empty today.
PRETEND = {
    ("BarkernotBob.github.io", 202): "needs-test",
    ("obsidian-ytfree", 2): "needs-test",
    ("blockchain", 46): "urgent",
}

BUCKETS = ["grill", "test", "blocked", "in-progress", "ready", "parked"]
LABEL = {"grill": "Grill", "test": "Test", "blocked": "Blocked", "in-progress": "In progress",
         "ready": "Ready", "parked": "Parked"}
GROUP = {"grill": "Needs you", "test": "Needs you", "blocked": "Needs you",
         "in-progress": "Claude's queue", "ready": "Claude's queue", "parked": "Parked"}
ICON = {"grill": "🔥", "test": "🧪", "blocked": "⛔", "in-progress": "⚙️", "ready": "📋", "parked": "💤"}
NEEDS_YOU = ("grill", "test", "blocked")


def t(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def safe(s, n=70):
    s = re.sub(r'[\[\]#^|:\\/?*"<>]', "", s).strip()
    return (s[:n].rstrip() + "…") if len(s) > n else s


def first_para(body):
    for chunk in re.split(r"\n\s*\n", body or ""):
        c = chunk.strip()
        if not c or c.startswith("#") or re.fullmatch(r"\*\*[^*]+\*\*", c) or c.startswith("_Filed from"):
            continue
        return c
    return ""


def load():
    snap = json.load(open(HERE / "snapshot.json"))
    prs = json.load(open(HERE / "prs.json"))
    items, done = [], []
    for repo, issues in snap.items():
        proj = repo.split("/")[1]
        for i in issues:
            labels = {l["name"] for l in i["labels"]}
            extra = PRETEND.get((proj, i["number"]))
            if extra:
                labels.add(extra)
            if i["state"] == "CLOSED":
                if (i.get("stateReason") or "").upper() == "NOT_PLANNED":
                    continue
                refs = i.get("closedByPullRequestsReferences") or []
                what = [prs.get(repo, {}).get(str(r["number"]), {}).get("title") for r in refs]
                done.append(dict(proj=proj, num=i["number"], title=i["title"], url=i["url"],
                                 closed=t(i["closedAt"]), what=[w for w in what if w]))
                continue
            bucket = ("grill" if "needs-grilling" in labels else "test" if "needs-test" in labels
                      else "blocked" if "blocked" in labels else "in-progress" if "in-progress" in labels
                      else "parked" if "hold" in labels else "ready")
            urgent = "urgent" in labels
            comments = i["comments"]
            items.append(dict(
                proj=proj, repo=repo, num=i["number"], title=i["title"], url=i["url"], bucket=bucket,
                urgent=urgent, rank=(0 if urgent else BUCKETS.index(bucket) + 1),
                created=t(i["createdAt"]), updated=t(i["updatedAt"]), para=first_para(i["body"]),
                comment=(comments[-1]["body"] if comments else ""),
                pretend=extra, file=safe(f"{proj} {i['number']} – {i['title']}")))
    items.sort(key=lambda x: (x["rank"], x["created"]))
    done.sort(key=lambda x: x["closed"], reverse=True)
    return items, done


def age(d):
    days = (SNAP_TIME - d).days
    return "today" if days < 1 else f"{days}d"


def claude_link(prompt, proj):
    q = {"q": prompt}
    if (PROJECTS_DIR / proj).is_dir():
        q["folder"] = str(PROJECTS_DIR / proj)
    return "claude://code/new?" + urllib.parse.urlencode(q, quote_via=urllib.parse.quote)


def actions(it):
    """(label, url, copy-text) for each button on an item."""
    out = []
    if it["bucket"] == "grill":
        cmd = f"/backlog-grill {it['url']}"
        out.append(("Grill", claude_link(cmd, it["proj"]), cmd))
    if it["bucket"] == "test":
        p = f"Test passed: {it['url']}"
        f = f"Test failed: {it['url']} — what went wrong: "
        out.append(("Pass", claude_link(p, it["proj"]), p))
        out.append(("Fail", claude_link(f, it["proj"]), f))
    return out


def comment_heading(it):
    return {"grill": "Open questions", "blocked": "Why it's blocked", "test": "What to test"}.get(
        it["bucket"], "Latest note")


def quote(md):
    return "\n".join("> " + l if l.strip() else ">" for l in md.splitlines())


def write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)


def projects(items, done):
    names = sorted({i["proj"] for i in items})
    out = []
    for p in names:
        its = [i for i in items if i["proj"] == p]
        counts = {b: sum(i["bucket"] == b for i in its) for b in BUCKETS}
        week = [d for d in done if d["proj"] == p and (SNAP_TIME - d["closed"]).days < 7]
        out.append(dict(name=p, items=its, counts=counts, urgent=sum(i["urgent"] for i in its),
                        needs=sum(counts[b] for b in NEEDS_YOU), week=week,
                        done=[d for d in done if d["proj"] == p]))
    out.sort(key=lambda x: (-x["urgent"], -x["needs"], x["name"]))
    return out


STAMP = SNAP_TIME.strftime("%a %b %-d, %-I:%M %p")
PRETEND_NOTE = ("Prototype data: today's real issues (snapshot Oct 11). Nothing carries `needs-test` or "
                "`urgent` yet, so ytfree #2 and site #202 pretend to be Test, blockchain #46 pretends to be urgent.")


# ---------------------------------------------------------------- A, D-I: custom renderers (dataviewjs)
# Each is one view.js/view.css pair rendering hub / project / item from a shared data.json.
VIEWS = {  # letter: (folder, cssclass, source prefix)
    "A": ("A - App", "devhub-a", "a"),
    "D": ("D - Calm", "devhub-d", "d"),
    "E": ("E - Focus", "devhub-e", "e"),
    "F": ("F - Messages", "devhub-f", "f"),
    "G": ("G - Bright", "devhub-g", "g"),
    "H": ("H - Workspace", "devhub-h", "h"),
    "I": ("I - Briefing", "devhub-i", "i"),
}


def gen_view(letter, base, items, done, projs):
    folder, css, src = VIEWS[letter]
    d = base / folder
    root = f"{ROOT_NAME}/{folder}"
    data = dict(stamp=STAMP, note=PRETEND_NOTE, root=root, snap=SNAP_TIME.isoformat(),
                labels=LABEL, icons=ICON, buckets=BUCKETS, needsYou=list(NEEDS_YOU),
                projects=[dict(name=p["name"], counts=p["counts"], urgent=p["urgent"], needs=p["needs"],
                               week=len(p["week"]), total=len(p["items"]),
                               last=max([i["updated"] for i in p["items"]] + [x["closed"] for x in p["done"]]).isoformat())
                          for p in projs],
                items=[dict(proj=i["proj"], num=i["num"], title=i["title"], url=i["url"], bucket=i["bucket"],
                            urgent=i["urgent"], rank=i["rank"], created=i["created"].isoformat(),
                            updated=i["updated"].isoformat(),
                            age=age(i["created"]), file=i["file"], para=i["para"], comment=i["comment"],
                            commentHeading=comment_heading(i), pretend=i["pretend"],
                            actions=[dict(label=a, url=u, copy=c) for a, u, c in actions(i)]) for i in items],
                done=[dict(proj=x["proj"], num=x["num"], title=x["title"], url=x["url"],
                           closed=x["closed"].strftime("%b %-d, %Y"), closedIso=x["closed"].isoformat(),
                           week=(SNAP_TIME - x["closed"]).days < 7, what=x["what"]) for x in done])
    write(d / "_view" / "data.json", json.dumps(data))
    write(d / "_view" / "view.js", (HERE / f"{src}_view.js").read_text())
    write(d / "_view" / "view.css", (HERE / f"{src}_view.css").read_text())
    block = lambda kind, key="": (f"---\ncssclasses: [{css}]\n---\n```dataviewjs\nawait dv.view(\"{root}/_view\", "
                                  f"{{kind: \"{kind}\", key: {json.dumps(key)}, root: \"{root}\"}})\n```\n")
    write(d / "Dev Hub.md", block("hub"))
    for p in projs:
        write(d / "Projects" / f"{p['name']}.md", block("project", p["name"]))
    for i in items:
        write(d / "Items" / f"{i['file']}.md", block("item", f"{i['proj']}#{i['num']}"))


# ---------------------------------------------------------------- B: Sortable (Bases)
def gen_b(base, items, done, projs):
    d = base / "B - Sortable"
    folder = f"{ROOT_NAME}/B - Sortable"
    for i in items:
        fm = ["---", f"project: \"[[{folder}/Projects/{i['proj']}|{i['proj']}]]\"", f"issue: {i['num']}",
              f"bucket: \"{BUCKETS.index(i['bucket'])+1} · {LABEL[i['bucket']]}\"", f"group: \"{GROUP[i['bucket']]}\"", f"order: {i['rank']}",
              f"urgent: {str(i['urgent']).lower()}", f"opened: {i['created'].date()}",
              f"updated: {i['updated'].date()}", f"github: {i['url']}", "---", ""]
        body = []
        if i["pretend"]:
            body.append(f"> [!warning] Prototype: pretend `{i['pretend']}` label\n")
        btns = actions(i)
        if btns:
            ids = []
            for n, (lab, url, _) in enumerate(btns):
                bid = f"b{n}"
                ids.append(bid)
                style = "primary" if lab in ("Grill", "Pass") else "destructive" if lab == "Fail" else "default"
                body.append(f"```meta-bind-button\nid: {bid}\nhidden: true\nlabel: \"{ICON.get(i['bucket'],'')} {lab}\"\n"
                            f"style: {style}\nactions:\n  - type: open\n    link: \"{url}\"\n```\n")
            body.append("`BUTTON[" + ", ".join(ids) + "]`\n")
        body.append(f"> [!abstract] What it is\n{quote(i['para'] or '_No description._')}\n")
        if i["comment"]:
            body.append(f"> [!question]+ {comment_heading(i)}\n{quote(i['comment'])}\n")
        body.append(f"<small>[Open on GitHub ↗]({i['url']})</small>\n")
        write(d / "Items" / f"{i['file']}.md", "\n".join(fm) + "\n".join(body))

    item_cols = """    order:
      - file.name
      - bucket
      - formula.age
    sort:
      - property: order
        direction: ASC
      - property: opened
        direction: ASC"""
    for p in projs:
        fm = ["---"] + [f"{b.replace('-', '_')}: {p['counts'][b]}" for b in BUCKETS] + [
            f"needs_you: {p['needs']}", f"urgent: {p['urgent']}", f"shipped_week: {len(p['week'])}", "---", ""]
        body = [
                f"```base\nfilters:\n  and:\n    - file.inFolder(\"{folder}/Items\")\n"
                f"    - project == link(\"{folder}/Projects/{p['name']}\")\n"
                "formulas:\n  age: '(now() - date(opened)).days.round(0) + \"d\"'\n"
                f"views:\n  - type: table\n    name: Items\n    columnSize:\n      file.name: 430\n      bucket: 150\n      formula.age: 60\n{item_cols}\n```", ""]
        if p["week"]:
            body.append(f"> [!done]- Shipped this week ({len(p['week'])})\n" + "\n".join(
                f"> - [{x['title']}]({x['url']}) · {x['closed']:%b %-d}" for x in p["week"]) + "\n")
        if p["done"]:
            body.append(f"> [!example]- Completed ({len(p['done'])})\n" + "\n".join(
                f"> - **{x['title']}** · {x['closed']:%b %-d, %Y}" + (f"  \n>   _{x['what'][0]}_" if x["what"] else "")
                + f" · [↗]({x['url']})" for x in p["done"]) + "\n")
        write(d / "Projects" / f"{p['name']}.md", "\n".join(fm) + "\n".join(body))

    hub = f"""<small>Last updated {STAMP} · {PRETEND_NOTE}</small>

## Needs you

```base
filters:
  and:
    - file.inFolder("{folder}/Items")
    - group == "Needs you"
formulas:
  age: '(now() - date(opened)).days.round(0) + "d"'
views:
  - type: table
    name: Needs you
    columnSize:
      file.name: 400
      project: 180
      formula.age: 60
    groupBy:
      property: bucket
      direction: ASC
    order:
      - file.name
      - project
      - formula.age
    sort:
      - property: order
        direction: ASC
      - property: opened
        direction: ASC
```

## Projects

```base
filters:
  and:
    - file.inFolder("{folder}/Projects")
views:
  - type: table
    name: Projects
    order:
      - file.name
      - needs_you
      - grill
      - test
      - blocked
      - in_progress
      - ready
      - parked
      - shipped_week
    sort:
      - property: urgent
        direction: DESC
      - property: needs_you
        direction: DESC
```
"""
    write(d / "Dev Hub.md", hub)


# ---------------------------------------------------------------- C: Plain inbox (markdown only)
def gen_c(base, items, done, projs):
    d = base / "C - Plain"
    folder = f"{ROOT_NAME}/C - Plain"
    link = lambda i: f"[[{folder}/Items/{i['file']}|{i['title'].replace('[', '(').replace(']', ')')}]]"
    plink = lambda p: f"[[{folder}/Projects/{p}|{p}]]"

    for i in items:
        lines = [
                 f"{ICON[i['bucket']]} **{LABEL[i['bucket']]}**" + (" · 🚨 **Urgent**" if i["urgent"] else "")
                 + f" · {plink(i['proj'])} #{i['num']} · opened {i['created']:%b %-d}", ""]
        if i["pretend"]:
            lines += [f"> [!warning] Prototype: pretend `{i['pretend']}` label", ""]
        btns = actions(i)
        if btns:
            lines += [" · ".join(f"**[{ICON.get(i['bucket'],'')} {lab} →]({url})**" for lab, url, _ in btns), "",
                      "On your phone, if the button does nothing, copy this into Claude:", "",
                      "```", btns[0][2], "```", ""]
        lines += [i["para"] or "_No description._", ""]
        if i["comment"]:
            lines += [f"## {comment_heading(i)}", "", i["comment"], ""]
        lines += [f"[Open on GitHub ↗]({i['url']})", ""]
        write(d / "Items" / f"{i['file']}.md", "\n".join(lines))

    for p in projs:
        c = p["counts"]
        lines = [" · ".join(f"{ICON[b]} {c[b]} {LABEL[b]}" for b in BUCKETS if c[b]), ""]
        urgent = [i for i in p["items"] if i["urgent"]]
        if urgent:
            lines += ["## 🚨 Urgent", ""] + [f"- {link(i)} · {LABEL[i['bucket']]} · {age(i['created'])}" for i in urgent] + [""]
        for b in BUCKETS:
            its = [i for i in p["items"] if i["bucket"] == b and not i["urgent"]]
            if its:
                lines += [f"## {ICON[b]} {LABEL[b]}", ""] + [f"- {link(i)} · {age(i['created'])}" for i in its] + [""]
        if p["week"]:
            lines += [f"> [!done]- Shipped this week ({len(p['week'])})"] + [
                f"> - {x['title']} · {x['closed']:%b %-d} · [↗]({x['url']})" for x in p["week"]] + [""]
        if p["done"]:
            lines += [f"> [!example]- All completed work ({len(p['done'])})"] + [
                f"> - **{x['title']}** · {x['closed']:%b %-d, %Y}" + (f" — {x['what'][0]}" if x["what"] else "")
                + f" · [↗]({x['url']})" for x in p["done"]] + [""]
        write(d / "Projects" / f"{p['name']}.md", "\n".join(lines))

    lines = [f"*Updated {STAMP}*", "", f"> [!info]- About this prototype\n> {PRETEND_NOTE}", ""]
    for b in NEEDS_YOU:
        its = [i for i in items if i["bucket"] == b]
        lines += [f"## {ICON[b]} {LABEL[b]} ({len(its)})", ""]
        lines += [f"- {'🚨 ' if i['urgent'] else ''}{link(i)} · {plink(i['proj'])} · {age(i['created'])}" for i in its] or ["- Nothing here."]
        lines.append("")
    q = [i for i in items if GROUP[i["bucket"]] == "Claude's queue"]
    parked = [i for i in items if i["bucket"] == "parked"]
    week = [x for x in done if (SNAP_TIME - x["closed"]).days < 7]
    lines += ["## Everything else", "",
              f"⚙️ **Claude's queue:** {len(q)} · 💤 **Parked:** {len(parked)} · ✅ **Shipped this week:** {len(week)}", "",
              "| Project | 🔥 | 🧪 | ⛔ | ⚙️ | 📋 | 💤 |", "|---|--:|--:|--:|--:|--:|--:|"]
    for p in projs:
        lines.append(f"| {plink(p['name'])} | " + " | ".join(str(p["counts"][b] or "·") for b in BUCKETS) + " |")
    write(d / "Dev Hub.md", "\n".join(lines) + "\n")


if __name__ == "__main__":
    vault = Path(sys.argv[1])
    which = sys.argv[2] if len(sys.argv) > 2 else "ABCDEFGHI"
    base = vault / ROOT_NAME
    items, done = load()
    projs = projects(items, done)
    for L in which:
        if L in VIEWS:
            gen_view(L, base, items, done, projs)
    if "B" in which:
        gen_b(base, items, done, projs)
    if "C" in which:
        gen_c(base, items, done, projs)
    print(f"{len(items)} open, {len(done)} done, {len(projs)} projects → {base} ({which})")
