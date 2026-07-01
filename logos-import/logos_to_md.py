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
    return display,url,sortkey,name,(ch or 0),(vs or 0)

def expand_ref(raw):
    """raw -> (book_name, {chapters}, {verses}) for filtering. Ranges expanded."""
    try:
        m = re.match(r'^bible[^.]*\.(\d.*)$', raw)
        if not m: return None
        parts = m.group(1).split('-')
        def triple(p):
            xs=p.split('.')
            return int(xs[0]), (int(xs[1]) if len(xs)>1 else None), (int(xs[2]) if len(xs)>2 else None)
        b,ch,vs = triple(parts[0])
        if b not in BOOKS: return None
        name = BOOKS[b][0]
        chapters=set(); verses=set()
        if len(parts)==2:
            b2,ch2,vs2 = triple(parts[1])
            if b2==b and ch2==ch:
                chapters.add(f"{name} {ch}")
                if vs and vs2:
                    for v in range(vs, min(vs2, vs+60)+1): verses.add(f"{name} {ch}:{v}")
                elif vs: verses.add(f"{name} {ch}:{vs}")
            elif b2==b:
                for c in range(ch, ch2+1): chapters.add(f"{name} {c}")
                if vs: verses.add(f"{name} {ch}:{vs}")
                if vs2: verses.add(f"{name} {ch2}:{vs2}")
            else:
                chapters.add(f"{name} {ch}")
                if vs: verses.add(f"{name} {ch}:{vs}")
        else:
            chapters.add(f"{name} {ch}")
            if vs: verses.add(f"{name} {ch}:{vs}")
        return name, chapters, verses
    except Exception:
        return None

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
            adir=os.path.join(self.outdir,"Logos","_attachments")
            fn=f"{slug}-{h}{ext}"; fp=os.path.join(adir,fn)
            if os.path.exists(fp): return fn          # already downloaded -> skip network
            req=urllib.request.Request(uri, headers={"User-Agent":"Mozilla/5.0"})
            data=urllib.request.urlopen(req, timeout=30).read()
            os.makedirs(adir,exist_ok=True)
            open(fp,"wb").write(data)
            return fn
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
    os.makedirs(os.path.join(outdir,"Logos"),exist_ok=True)
    # Resource-id -> title map for notes anchored to a non-Bible book/commentary.
    # Lives INSIDE the vault so you can edit it in Obsidian; auto-created and
    # auto-extended (new IDs appended blank) so you never have to hunt them down.
    RES_TITLES={}; listed_ids=[]; seen_rids=[]
    map_path=os.path.join(outdir,"Logos","resource-titles.md")
    def _parse_map(path):
        try: f=open(path,encoding="utf-8")
        except Exception: return
        for ln in f:
            s=ln.strip()
            if not s or s.startswith("#") or "=" not in s: continue
            s=re.sub(r'^[-*\s]+','',s)          # tolerate "- " / "* " list markers
            k,v=s.split("=",1); k=k.strip().strip("`").strip()
            if not k: continue
            if k not in listed_ids: listed_ids.append(k)
            if v.strip(): RES_TITLES[k]=v.strip()
    # vault copy is authoritative; if absent, seed from the toolkit copy (.md or .txt)
    for sp in (map_path,
               os.path.join(os.path.dirname(os.path.abspath(__file__)),"resource-titles.md"),
               os.path.join(os.path.dirname(os.path.abspath(__file__)),"resource-titles.txt")):
        if os.path.exists(sp): _parse_map(sp); break
    def title_for(rid):
        return RES_TITLES.get(rid) or re.sub(r'^(LLS|PBB):','',rid)
    # index existing output by logos_id -> path (for incremental, no-duplicate writes)
    existing={}
    for root,_,files in os.walk(os.path.join(outdir,"Logos")):
        for f in files:
            if not f.endswith(".md"): continue
            p=os.path.join(root,f)
            try: head=open(p,encoding="utf-8").read(4000)
            except Exception: continue
            m=re.search(r'^logos_id:\s*(\S+)', head, re.M)
            if m: existing[m.group(1)]=p
    c=sqlite3.connect(db); c.row_factory=sqlite3.Row; cur=c.cursor()
    nb={r["ExternalId"]:r["Title"] for r in cur.execute("select ExternalId,Title from Notebooks")}
    imp="ContentRichText is not null and trim(ContentRichText)<>'' and IsTrashed=0 and IsDeleted=0"
    q=f"select * from Notes where {imp}"
    rows=cur.execute(q).fetchall()
    if ids: rows=[r for r in rows if r["NoteId"] in ids]
    conv=Conv(outdir,images)
    used=set(); made=0; skipped=0
    # facet refs per note (for anchor passages)
    facet={}
    for r in cur.execute("select NoteId,DataTypeId,BibleBook,Reference from NoteAnchorFacetReferences"):
        facet.setdefault(r["NoteId"],[]).append(r)
    # Text-range anchors: which resource each note is anchored INTO (a book/commentary,
    # or a Bible). We record the non-Bible ones on each note so its source is always
    # visible/searchable. Bibles are told apart structurally: a resource that carries
    # original-language word data on ANY anchor is a Bible/interlinear text, so we skip
    # those (the passage already captures them) to avoid tagging ~every note "ESV".
    resid={r["ResourceIdId"]:r["ResourceId"] for r in cur.execute("select ResourceIdId,ResourceId from ResourceIds")}
    bible_res=set(); tr_res={}
    for r in cur.execute("select NoteId,AnchorIndex,ResourceIdId,WordNumberCount from NoteAnchorTextRanges"):
        rid=resid.get(r["ResourceIdId"])
        if not rid: continue
        tr_res.setdefault(r["NoteId"],{})[r["AnchorIndex"]]=rid
        if r["WordNumberCount"] is not None and r["WordNumberCount"]>=0: bible_res.add(rid)
    def resource_anchors(nid):
        out=[]
        for ai in sorted(tr_res.get(nid,{})):
            rid=tr_res[nid][ai]
            if rid in bible_res: continue          # a Bible text -> already covered by passages
            if rid not in out: out.append(rid)
        return out
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
        seen=set(); pinfo=[]
        for raw in raws:
            pr=parse_ref(raw)
            if pr and pr[0] not in seen:
                seen.add(pr[0]); pinfo.append(pr)
        passages=[p[0] for p in pinfo]; sortkeys=[p[2] for p in pinfo]
        # Filter fields (book/chapter/verse) = anchor(s) UNION every inline reference
        # link in the body, so search finds a note by anything it references.
        filter_raws=list(raws)
        for m in re.findall(r'Reference="(bible[^"]+)"', r["ContentRichText"] or ""):
            filter_raws.append(m)
        books=set(); chapters=set(); verses=set()
        for raw in filter_raws:
            e=expand_ref(raw)
            if e: books.add(e[0]); chapters|=e[1]; verses|=e[2]
        def bysort(items):  # order by canonical book, then chapter, then verse
            def k(s):
                mm=re.match(r'^(.*?)(?: (\d+)(?::(\d+))?)?$', s)
                name=mm.group(1); ch=int(mm.group(2) or 0); vs=int(mm.group(3) or 0)
                bn=next((n for n,(nm,ab) in BOOKS.items() if nm==name),99)
                return (bn, ch, vs)
            return sorted(items, key=k)
        # non-Bible resource(s) this note is anchored to (records provenance always,
        # and names the folder when there's no Bible passage)
        res_anchors = resource_anchors(r["NoteId"])
        for rid in res_anchors:
            if rid not in seen_rids: seen_rids.append(rid)
        # primary passage = the note's Logos anchor (first entry), not lowest verse
        res_title = title_for(res_anchors[0]) if (not pinfo and res_anchors) else None
        if sortkeys:
            primary_sort = sortkeys[0]; primary_display = passages[0]
            book_folder = primary_display.rsplit(" ",1)[0]
        elif res_title:
            primary_sort = 999999999; primary_display = None
            book_folder = res_title
        else:
            primary_sort = 999999999; primary_display = None
            book_folder = "Unsorted"
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
        elif res_title:
            fnbase = f"{sanitize(res_title,40)} — {snippet}"
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
            if local: body=body.replace(f"__IMG__{uri}__IMG__", f"![[{local}]]")  # vault embed
            else: body=body.replace(f"__IMG__{uri}__IMG__", f"![]({uri})")        # hotlink fallback
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
        fm.append(f'logos_link: "https://ref.ly/logos4/NotesTool?EditNoteId={r["ExternalId"]}"')
        fm.append(f'created: {r["CreatedDate"]}')
        if r["ModifiedDate"]: fm.append(f'updated: {r["ModifiedDate"]}')
        if pinfo:
            fm.append("passages:")
            for disp,url,sk,name,ch,vs in pinfo:
                tgt=f"{name} {ch}"                       # local Bible chapter note
                if vs: tgt=f"{tgt}#{vs}"                 # heading anchor = exact verse
                link=f"[[{tgt}]]" if disp==tgt else f"[[{tgt}|{disp}]]"
                fm.append(f'  - "{link}"')
        else:
            fm.append("passages: []")
        fm.append(f'passage_sort: {primary_sort}')
        if books:
            fm.append("books:")
            for b in bysort(books): fm.append(f'  - "{b}"')
        if chapters:
            fm.append("chapters:")
            for ch in bysort(chapters): fm.append(f'  - "{ch}"')
        if verses:
            fm.append("verses:")
            for v in bysort(verses): fm.append(f'  - "{v}"')
        if res_anchors:
            # Where the note came from in Logos. Raw ID is always shown (so you can
            # search it); the readable title is prepended once you name it in
            # resource-titles.md.
            fm.append("resources:")
            for rid in res_anchors:
                t=RES_TITLES.get(rid)
                fm.append(f'  - "{t} ({rid})"' if t else f'  - "{rid}"')
        if r["NotebookExternalId"] and nb.get(r["NotebookExternalId"]):
            fm.append(f'notebook: "{nb[r["NotebookExternalId"]]}"')
        if tags:
            fm.append("tags:")
            for t in tags: fm.append(f'  - {t}')
        fm.append("source: logos")
        fm.append("---")
        folder=os.path.join(outdir, "Logos", sanitize(book_folder,40) or "Unsorted")
        content="\n".join(fm)+"\n\n"+body+"\n"
        newpath=os.path.join(folder,fn+".md")
        oldpath=existing.get(r["ExternalId"])
        if oldpath and os.path.exists(oldpath):
            try: cur_txt=open(oldpath,encoding="utf-8").read()
            except Exception: cur_txt=None
            same_path = os.path.abspath(oldpath)==os.path.abspath(newpath)
            if cur_txt==content and same_path:
                skipped+=1; continue                 # unchanged -> leave it alone
            if not same_path:
                try: os.remove(oldpath)              # note renamed -> drop stale file
                except Exception: pass
        os.makedirs(folder,exist_ok=True)
        open(newpath,"w",encoding="utf-8").write(content)
        made+=1
    # Remove now-empty book folders left behind when notes were renamed/refoldered.
    logdir=os.path.join(outdir,"Logos")
    for d in os.listdir(logdir) if os.path.isdir(logdir) else []:
        p=os.path.join(logdir,d)
        if d=="_attachments": continue
        try:
            if os.path.isdir(p) and not os.listdir(p): os.rmdir(p)
        except Exception: pass
    # Update the editable resource-titles map: append any newly-seen IDs (blank),
    # keep existing order + any titles you've filled in. Only rewrite when needed.
    new_ids=[r for r in seen_rids if r not in listed_ids]
    if new_ids or not os.path.exists(map_path):
        out=["# Resource titles","",
             "Some Logos notes are anchored to a book or commentary instead of a Bible",
             "passage. Those get named and foldered by the resource. Logos only stores",
             "an opaque ID, so type a readable name after the equals sign for each ID you",
             "care about, then re-run the importer — the matching notes move into a folder",
             "with that name. Leave one blank and it just uses the raw code. New IDs are",
             "added here automatically as you make more such notes.","",
             "```"]
        for k in listed_ids+new_ids: out.append(f"{k} = {RES_TITLES.get(k,'')}")
        out.append("```"); out.append("")
        try: open(map_path,"w",encoding="utf-8").write("\n".join(out))
        except Exception: pass
    print(f"wrote {made} new/changed, skipped {skipped} unchanged -> {outdir}")
    if new_ids: print(f"  added {len(new_ids)} new resource id(s) to {map_path} — fill in titles there")

if __name__=="__main__": main()
