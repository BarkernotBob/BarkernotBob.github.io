#!/usr/bin/env python3
"""Emit Logos notes as JSON for the Raycast "Search Notes" command.

Read-only: opens the database with mode=ro and never writes. Reuses the same
converter as logos_to_md.py (Conv.render, parse_ref) so search results match the
notes the importer produces — correct text and real Bible references.

Usage: logos_notes_json.py <notestool.db>
Output (stdout): a JSON array of {id,title,body,notebook,tags,reference,referenceUrl,modified}.
"""
import sys, os, re, json, sqlite3, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import logos_to_md as L


def main():
    if len(sys.argv) < 2:
        print("[]"); return
    db = sys.argv[1]
    try:
        dburi = "file:" + urllib.request.pathname2url(os.path.abspath(db)) + "?mode=ro"
        c = sqlite3.connect(dburi, uri=True)
    except sqlite3.OperationalError:
        c = sqlite3.connect(db)
    c.row_factory = sqlite3.Row
    cur = c.cursor()

    nb = {r["ExternalId"]: r["Title"] for r in cur.execute("select ExternalId,Title from Notebooks")}
    facet = {}
    for r in cur.execute("select NoteId,Reference from NoteAnchorFacetReferences"):
        facet.setdefault(r["NoteId"], []).append(r["Reference"])

    conv = L.Conv("/tmp", images=False)   # images off: never fetch anything
    imp = "ContentRichText is not null and trim(ContentRichText)<>'' and IsTrashed=0 and IsDeleted=0"
    out = []
    for r in cur.execute(f"select * from Notes where {imp}"):
        conv.imgnote = []
        body = conv.render(r["ContentRichText"])
        body = re.sub(r'__IMG__.*?__IMG__', '', body)   # drop image placeholders

        # anchored Bible reference: AnchorsJson reference.raw -> facet -> inline
        raws = []
        aj = r["AnchorsJson"]
        if aj and aj.strip() not in ("", "[]"):
            try:
                for a0 in json.loads(aj):
                    if isinstance(a0, dict) and "reference" in a0 and "raw" in a0["reference"]:
                        raws.append(a0["reference"]["raw"])
            except Exception:
                pass
        if not raws:
            for ref in facet.get(r["NoteId"], []):
                if ref and ref.startswith("bible"):
                    raws.append(ref)
        if not raws:
            for m in re.findall(r'Reference="(bible[^"]+)"', r["ContentRichText"] or ""):
                raws.append(m)
        ref_display = ""; ref_url = ""
        for raw in raws:
            pr = L.parse_ref(raw)
            if pr:
                ref_display, ref_url = pr[0], pr[1]; break

        # tags
        tags = []
        tj = r["TagsJson"]
        if tj:
            try:
                for t in json.loads(tj):
                    if isinstance(t, dict) and "plain" in t:
                        tags.append(t["plain"]["text"])
            except Exception:
                pass

        # title = first line of real prose (skip bare links/urls), else ref, else notebook
        notebook = nb.get(r["NotebookExternalId"]) or ""
        snippet = ""
        for line in body.splitlines():
            s = re.sub(r'\[([^\]]*)\]\([^)]*\)', r'\1', line.strip())
            s = re.sub(r'[*_#>`]', '', s)
            s = re.sub(r'^[\-\d.\s]+', '', s).strip()
            if not s or re.match(r'^\w+://', s):
                continue
            snippet = s[:80]; break
        title = snippet or ref_display or notebook or "(untitled note)"

        out.append({
            "id": r["ExternalId"],
            "title": title,
            "body": body,
            "notebook": notebook,
            "tags": tags,
            "reference": ref_display,
            "referenceUrl": ref_url,
            "modified": r["ModifiedDate"] or r["CreatedDate"] or "",
        })
    print(json.dumps(out))


if __name__ == "__main__":
    main()
