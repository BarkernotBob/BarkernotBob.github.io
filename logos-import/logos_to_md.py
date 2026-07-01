#!/usr/bin/env python3
"""Logos notestool.db -> Obsidian Markdown converter.
Usage: logos_to_md.py <notestool.db> <out_dir> [--sample N | --ids a,b,c] [--no-images]
"""
import sqlite3, json, re, sys, os, html, hashlib, urllib.request
import xml.etree.ElementTree as ET

# ---- Logos Bible book number -> (full name, ref.ly abbreviation) ----
BOOKS = {
 1:("Genesis","Ge"),2:("Exodus","Ex"),3:("Leviticus","Lv"),4:("Numbers","Nu"),
 5:("Deuteronomy","Dt"),6:("Joshua","Jos"),7:("Judges","Jdg"),8:("Ruth","Ru"),
 9:("1 Samuel","1Sa"),10:("2 Samuel","2Sa"),11:("1 Kings","1Ki"),12:("2 Kings","2Ki"),
 13:("1 Chronicles","1Ch"),14:("2 Chronicles","2Ch"),15:("Ezra","Ezr"),16:("Nehemiah","Ne"),
 17:("Esther","Es"),18:("Job","Job"),19:("Psalms","Ps"),20:("Proverbs","Pr"),
 21:("Ecclesiastes","Ec"),22:("Song of Solomon","So"),23:("Isaiah","Is"),24:("Jeremiah","Je"),
 25:("Lamentations","La"),26:("Ezekiel","Eze"),27:("Daniel","Da"),28:("Hosea","Ho"),
 29:("Joel","Joe"),30:("Amos","Am"),31:("Obadiah","Ob"),32:("Jonah","Jon"),
 33:("Micah","Mic"),34:("Nahum","Na"),35:("Habakkuk","Hab"),36:("Zephaniah","Zep"),
 37:("Haggai","Hag"),38:("Zechariah","Zec"),39:("Malachi","Mal"),
 61:("Matthew","Mt"),62:("Mark","Mk"),63:("Luke","Lk"),64:("John","Jn"),65:("Acts","Ac"),
 66:("Romans","Ro"),67:("1 Corinthians","1Co"),68:("2 Corinthians","2Co"),69:("Galatians","Ga"),
 70:("Ephesians","Eph"),71:("Philippians","Php"),72:("Colossians","Col"),
 73:("1 Thessalonians","1Th"),74:("2 Thessalonians","2Th"),75:("1 Timothy","1Ti"),
 76:("2 Timothy","2Ti"),77:("Titus","Tt"),78:("Philemon","Phm"),79:("Hebrews","Heb"),
 80:("James","Jas"),81:("1 Peter","1Pe"),82:("2 Peter","2Pe"),83:("1 John","1Jn"),
 84:("2 John","2Jn"),85:("3 John","3Jn"),86:("Jude","Jud"),87:("Revelation","Re"),
}

def parse_ref(raw):
    """'bible+esv.83.2.15-83.2.17' -> (display, url, sortkey, book_name) or None"""
    try:
        return _parse_ref(raw)
    except Exception:
        return None

def _parse_ref(raw):
    m = re.match(r'^bible[^.]*\.(\d.*)$', raw)
    if not m: return None
    body = m.group(1)
    parts = body.split('-')
    def triple(p):
        xs = p.split('.')
        b = int(xs[0]); ch = int(xs[1]) if len(xs)>1 else None; vs = int(xs[2]) if len(xs)>2 else None
        return b,ch,vs
    b,ch,vs = triple(parts[0])
    if b not in BOOKS: return None
    name,abbr = BOOKS[b]
    def disp(ch,vs): return f"{ch}:{vs}" if vs else f"{ch}"
    if len(parts)==2:
        b2,ch2,vs2 = triple(parts[1])
        if ch2==ch:
            display=f"{name} {disp(ch,vs)}–{vs2}" if vs2 else f"{name} {disp(ch,vs)}"
            url=f"https://ref.ly/{abbr}{ch}.{vs}-{vs2}" if vs2 else f"https://ref.ly/{abbr}{ch}"
        else:
            display=f"{name} {disp(ch,vs)}–{disp(ch2,vs2)}"
            url=f"https://ref.ly/{abbr}{ch}.{vs}-{ch2}.{vs2}"
    else:
        display=f"{name} {disp(ch,vs)}"
        url=f"https://ref.ly/{abbr}{ch}.{vs}" if vs else f"https://ref.ly/{abbr}{ch}"
    sortkey = b*10**6 + (ch or 0)*10**3 + (vs or 0)
    return display,url,sortkey,name

def clean(t):
    return t if t else ""

class Conv:
    def __init__(self, outdir, images=True):
        self.outdir=outdir; self.images=images; self.imgnote=[]
    def inline(self, el):
        """render an inline element (Run/Reference/ResourceLink/UriLink/UriMedia) to md text"""
        tag=el.tag
        if tag=="Run":
            txt=clean(el.get("Text"))
            if txt.strip()=="" : return txt  # preserve spaces/tabs
            bold = el.get("FontBold")=="True"
            ital = el.get("FontItalic")=="True"
            sup  = el.get("FontVariant")=="Superscript"
            s=txt
            if bold and ital: s=f"***{s}***"
            elif bold: s=f"**{s}**"
            elif ital: s=f"*{s}*"
            if sup: s=f"<sup>{s}</sup>"
            return s
        if tag=="Reference":
            raw=el.get("Reference","")
            inner="".join(self.inline(c) for c in el)  or raw
            pr=parse_ref(raw) if raw.startswith("bible") else None
            if pr: return f"[{inner.strip()}]({pr[1]})"
            return inner  # non-bible ref: keep text
        if tag=="UriLink":
            uri=html.unescape(el.get("Uri",""))
            inner="".join(self.inline(c) for c in el).strip() or uri
            return f"[{inner}]({uri})"
        if tag=="ResourceLink":
            # usually wraps a UriLink (which carries the real url) or plain citation runs
            return "".join(self.inline(c) for c in el)
        if tag=="UriMedia":
            uri=html.unescape(el.get("Uri",""))
            self.imgnote.append(uri)
            return f"__IMG__{uri}__IMG__"
        # unknown inline: recurse
        return "".join(self.inline(c) for c in el)+clean(el.tail)
    def para(self, el):
        return "".join(self.inline(c) for c in el).rstrip()
    def render(self, xaml):
        try:
            root=ET.fromstring("<Root>"+xaml+"</Root>")
        except ET.ParseError:
            # fallback: strip tags
            return re.sub(r'<[^>]+>','',xaml)
        out=[]
        def walk(node, indent=0, ordered=False, idx=0):
            for ch in node:
                if ch.tag=="Paragraph":
                    line=self.para(ch)
                    if line.strip(): out.append(("  "*indent)+line)
                    else: out.append("")
                elif ch.tag=="List":
                    kind=ch.get("Kind","")
                    od = kind.lower() in ("decimal","loweralpha","upperalpha","lowerroman","upperroman")
                    n=1
                    for li in ch:
                        if li.tag!="ListItem": continue
                        # first paragraph inline as the bullet, rest indented
                        paras=[p for p in li if p.tag=="Paragraph"]
                        sublists=[p for p in li if p.tag=="List"]
                        text=self.para(paras[0]) if paras else ""
                        marker=f"{n}. " if od else "- "
                        out.append(("  "*indent)+marker+text.strip())
                        for extra in paras[1:]:
                            t=self.para(extra)
                            if t.strip(): out.append(("  "*(indent+1))+t.strip())
                        for sl in sublists:
                            walk(li, indent+1)
                        n+=1
                elif ch.tag=="ListItem":
                    continue
                else:
                    line=self.para(ch)
                    if line.strip(): out.append(line)
        walk(root)
        # collapse >1 blank line, join
        md=[]
        prev_blank=False
        for ln in out:
            blank = (ln.strip()=="")
            if blank and prev_blank: continue
            md.append(ln); prev_blank=blank
        return "\n".join(md).strip()

    def fetch_image(self, uri, slug):
        if not self.images: return None
        try:
            h=hashlib.md5(uri.encode()).hexdigest()[:8]
            ext=".png"
            req=urllib.request.Request(uri, headers={"User-Agent":"Mozilla/5.0"})
            data=urllib.request.urlopen(req, timeout=30).read()
            adir=os.path.join(self.outdir,"_attachments"); os.makedirs(adir,exist_ok=True)
            fn=f"{slug}-{h}{ext}"; open(os.path.join(adir,fn),"wb").write(data)
            return f"_attachments/{fn}"
        except Exception as e:
            return None

def sanitize(s, maxlen=60):
    s=re.sub(r'[\\/:*?"<>|#\^\[\]]',' ',s)
    s=re.sub(r'\s+',' ',s).strip()
    return s[:maxlen].strip()

def main():
    db=sys.argv[1]; outdir=sys.argv[2]
    sample=None; ids=None; images=True
    a=sys.argv[3:]
    if "--no-images" in a: images=False; a=[x for x in a if x!="--no-images"]
    if a and a[0]=="--sample": sample=int(a[1])
    if a and a[0]=="--ids": ids=[int(x) for x in a[1].split(",")]
    os.makedirs(outdir,exist_ok=True)
    c=sqlite3.connect(db); c.row_factory=sqlite3.Row; cur=c.cursor()
    nb={r["ExternalId"]:r["Title"] for r in cur.execute("select ExternalId,Title from Notebooks")}
    imp="ContentRichText is not null and trim(ContentRichText)<>'' and IsTrashed=0 and IsDeleted=0"
    q=f"select * from Notes where {imp}"
    rows=cur.execute(q).fetchall()
    if ids: rows=[r for r in rows if r["NoteId"] in ids]
    conv=Conv(outdir,images)
    used=set(); made=0
    # facet refs per note (for anchor passages)
    facet={}
    for r in cur.execute("select NoteId,DataTypeId,BibleBook,Reference from NoteAnchorFacetReferences"):
        facet.setdefault(r["NoteId"],[]).append(r)
    picked=rows
    if sample:
        # variety: ensure some lists, images, bible-anchored, resource-anchored, urilink
        def has(r,tok): return tok in (r["ContentRichText"] or "")
        buckets=[]
        for pred in [lambda r:has(r,"<List"), lambda r:has(r,"UriMedia"),
                     lambda r:has(r,"UriLink"), lambda r:(r["AnchorsJson"] or "").find('"reference"')>=0,
                     lambda r:(r["AnchorsJson"] or "").find('"textRange"')>=0, lambda r:has(r,"<Reference")]:
            for r in rows:
                if pred(r) and r["NoteId"] not in [b["NoteId"] for b in buckets]:
                    buckets.append(r); break
        for r in rows:
            if len(buckets)>=sample: break
            if r["NoteId"] not in [b["NoteId"] for b in buckets]: buckets.append(r)
        picked=buckets[:sample]

    for r in picked:
        conv.imgnote=[]
        body=conv.render(r["ContentRichText"])
        # ---- anchors / passages ----
        passages=[]; sortkeys=[]
        # 1 direct bible anchors from AnchorsJson
        aj=r["AnchorsJson"]
        raws=[]
        if aj and aj.strip() not in ("","[]"):
            try:
                for a0 in json.loads(aj):
                    if isinstance(a0,dict) and "reference" in a0 and "raw" in a0["reference"]:
                        raws.append(a0["reference"]["raw"])
            except: pass
        # 2 facet bible refs
        if not raws:
            for f in facet.get(r["NoteId"],[]):
                if f["Reference"] and f["Reference"].startswith("bible"): raws.append(f["Reference"])
        # 3 inline references
        if not raws:
            for m in re.findall(r'Reference="(bible[^"]+)"', r["ContentRichText"] or ""):
                raws.append(m)
        seen=set()
        for raw in raws:
            pr=parse_ref(raw)
            if pr and pr[0] not in seen:
                seen.add(pr[0]); passages.append(pr[0]); sortkeys.append(pr[2])
        # primary passage = the note's Logos anchor (first entry), not lowest verse
        if sortkeys:
            primary_sort = sortkeys[0]; primary_display = passages[0]
        else:
            primary_sort = 999999999; primary_display = None
        book_folder = primary_display.rsplit(" ",1)[0] if primary_display else "Unsorted"
        # ---- title / snippet: first line of real prose (not a bare link/reference) ----
        snippet="note"
        for l in body.splitlines():
            s=re.sub(r'\[([^\]]*)\]\([^)]*\)', r'\1', l.strip())   # link -> its text
            s=re.sub(r'[*_#>`]','',s)
            s=re.sub(r'^[\-\d.\s]+','',s).strip()
            if not s or re.match(r'^\w+://', s): continue
            snippet=sanitize(s); break
        # filename
        if primary_display:
            fnbase = f"{primary_display.replace(':','.')} — {snippet}"
        else:
            fnbase = snippet
        fnbase=sanitize(fnbase,80) or "note"
        fn=fnbase; k=2
        while fn.lower() in used: fn=f"{fnbase} ({k})"; k+=1
        used.add(fn.lower())
        # images
        slug=sanitize(fnbase,30).replace(" ","-").lower() or "img"
        for uri in conv.imgnote:
            local=conv.fetch_image(uri,slug)
            if local: body=body.replace(f"__IMG__{uri}__IMG__", f"![]({local})")
            else: body=body.replace(f"__IMG__{uri}__IMG__", f"![]({uri})")
        # tags
        tags=[]
        tj=r["TagsJson"]
        if tj:
            try:
                for t in json.loads(tj):
                    if isinstance(t,dict) and "plain" in t: tags.append(t["plain"]["text"])
            except: pass
        # frontmatter
        fm=["---"]
        fm.append(f'title: "{fnbase}"')
        fm.append(f'logos_id: {r["ExternalId"]}')
        fm.append(f'created: {r["CreatedDate"]}')
        if r["ModifiedDate"]: fm.append(f'updated: {r["ModifiedDate"]}')
        if passages:
            fm.append("passages:")
            for p in passages: fm.append(f'  - "{p}"')
        else:
            fm.append("passages: []")
        fm.append(f'passage_sort: {primary_sort}')
        if r["NotebookExternalId"] and nb.get(r["NotebookExternalId"]):
            fm.append(f'notebook: "{nb[r["NotebookExternalId"]]}"')
        if tags:
            fm.append("tags:")
            for t in tags: fm.append(f'  - {t}')
        fm.append("source: logos")
        fm.append("publish: false")
        fm.append("---")
        folder=os.path.join(outdir, "Logos", sanitize(book_folder,40) or "Unsorted")
        os.makedirs(folder,exist_ok=True)
        open(os.path.join(folder,fn+".md"),"w").write("\n".join(fm)+"\n\n"+body+"\n")
        made+=1
    print(f"wrote {made} notes to {outdir}")

if __name__=="__main__": main()
