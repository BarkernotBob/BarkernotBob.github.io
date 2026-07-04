// ESV Tooltip component — returns null (no server-side markup).
// All behaviour is injected client-side via afterDOMLoaded:
//   1. Scan article text for Bible references (e.g. "John 3:16", "Rom 8:28-30").
//   2. Wrap each match in a <span class="esv-ref"> with a subtle dotted underline.
//   3. On hover (desktop) or tap (mobile) fetch the passage from the ESV API and
//      show it in a fixed-position popover — never reflows the surrounding text.
//
// The API token is public by design (client-side, non-commercial ESV API tier).
// Get a free token at https://api.esv.org/ and paste it below.

var ESV_API_TOKEN = "a5482b8a3de691ca8c6743dc2fb183fe2dcaf05c";

var esvTooltipCss = `
.esv-ref {
  text-decoration: underline dotted;
  text-decoration-color: var(--secondary);
  text-underline-offset: 3px;
  cursor: help;
  transition: color 0.12s;
}
.esv-ref:hover,
.esv-ref.esv-active {
  color: var(--secondary);
}

.esv-popover {
  position: fixed;
  z-index: 9999;
  width: max-content;
  max-width: 30rem;
  max-height: 60vh;
  overflow-y: auto;
  background: var(--light);
  color: var(--darkgray);
  border: 1px solid var(--lightgray);
  border-radius: 8px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.18);
  padding: 0.85rem 1rem 0.7rem;
  font-family: var(--bodyFont);
  font-size: 0.9rem;
  line-height: 1.55;
  /* Hidden without affecting layout so showing it never reflows anything. */
  visibility: hidden;
  opacity: 0;
  transition: opacity 0.12s;
  pointer-events: none;
}
.esv-popover.esv-visible {
  visibility: visible;
  opacity: 1;
  pointer-events: auto;
}
@media (max-width: 34rem) {
  .esv-popover { max-width: calc(100vw - 2rem); }
}
.esv-popover .esv-pop-ref {
  font-family: var(--headerFont);
  font-weight: 600;
  color: var(--dark);
  margin: 0 0 0.35rem;
  font-size: 0.95rem;
}
.esv-popover .esv-pop-body {
  white-space: pre-wrap;
  margin: 0;
}
.esv-popover .esv-pop-body b {
  color: var(--secondary);
  font-weight: 600;
}
.esv-popover .esv-pop-footer {
  margin-top: 0.55rem;
  font-size: 0.7rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--gray);
}
.esv-popover .esv-pop-close {
  display: none;
}
@media (hover: none) {
  .esv-popover .esv-pop-close {
    display: inline-block;
    float: right;
    border: none;
    background: transparent;
    color: var(--gray);
    font-size: 1.1rem;
    line-height: 1;
    cursor: pointer;
    padding: 0 0 0 0.5rem;
    margin-top: -0.15rem;
  }
}
`;

var esvTooltipAfterDOMLoaded = `
(function () {
  var ESV_API_TOKEN = ${JSON.stringify(ESV_API_TOKEN)};

  // Full book names + common abbreviations. Longer names first so the alternation
  // prefers "Song of Solomon" over "Song", "1 John" over "John", etc.
  var BOOKS = [
    "Genesis","Exodus","Leviticus","Numbers","Deuteronomy","Joshua","Judges","Ruth",
    "1 Samuel","2 Samuel","1 Kings","2 Kings","1 Chronicles","2 Chronicles","Ezra",
    "Nehemiah","Esther","Job","Psalms","Psalm","Proverbs","Ecclesiastes",
    "Song of Solomon","Song of Songs","Isaiah","Jeremiah","Lamentations","Ezekiel",
    "Daniel","Hosea","Joel","Amos","Obadiah","Jonah","Micah","Nahum","Habakkuk",
    "Zephaniah","Haggai","Zechariah","Malachi","Matthew","Mark","Luke","John","Acts",
    "Romans","1 Corinthians","2 Corinthians","Galatians","Ephesians","Philippians",
    "Colossians","1 Thessalonians","2 Thessalonians","1 Timothy","2 Timothy","Titus",
    "Philemon","Hebrews","James","1 Peter","2 Peter","1 John","2 John","3 John","Jude",
    "Revelation",
    // Safe abbreviations (require a following chapter:verse to match, so low false-positive risk)
    "Gen","Exod","Lev","Num","Deut","Josh","Judg","Neh","Esth","Ps","Prov","Eccl",
    "Isa","Jer","Lam","Ezek","Dan","Obad","Mic","Nah","Hab","Zeph","Hag","Zech","Mal",
    "Matt","Rom","1 Cor","2 Cor","Gal","Eph","Phil","Col","1 Thess","2 Thess","1 Tim",
    "2 Tim","Philem","Heb","Jas","1 Pet","2 Pet","Rev"
  ];

  function esc(s) { return s.replace(/[.*+?^\${}()|[\\]\\\\]/g, "\\\\$&"); }
  var bookAlt = BOOKS.slice().sort(function (a, b) { return b.length - a.length; }).map(esc).join("|");
  // Book + chapter, then optionally either a :verse (with ranges/lists) OR a -chapter range.
  // \\.? allows "Gen." style abbreviations. Only m[0] (the whole match) is used downstream.
  var REF_RE = new RegExp(
    "\\\\b(?:" + bookAlt + ")\\\\.?\\\\s+\\\\d+(?::\\\\d+(?:[\\u2013-]\\\\d+(?::\\\\d+)?)?(?:,\\\\s*\\\\d+(?::\\\\d+)?(?:[\\u2013-]\\\\d+)?)*|[\\u2013-]\\\\d+)?",
    "g"
  );

  var cache = {};
  var popover = null;
  var activeSpan = null;
  var hideTimer = null;

  function ensurePopover() {
    if (popover) return popover;
    popover = document.createElement("div");
    popover.className = "esv-popover";
    popover.innerHTML =
      '<button class="esv-pop-close" aria-label="Close">&times;</button>' +
      '<p class="esv-pop-ref"></p>' +
      '<p class="esv-pop-body"></p>' +
      '<div class="esv-pop-footer">English Standard Version</div>';
    document.body.appendChild(popover);
    popover.addEventListener("mouseenter", function () { clearTimeout(hideTimer); });
    popover.addEventListener("mouseleave", scheduleHide);
    popover.querySelector(".esv-pop-close").addEventListener("click", hidePopover);
    return popover;
  }

  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hidePopover, 180);
  }

  function hidePopover() {
    if (!popover) return;
    popover.classList.remove("esv-visible");
    if (activeSpan) { activeSpan.classList.remove("esv-active"); activeSpan = null; }
  }

  function positionPopover(span) {
    var r = span.getBoundingClientRect();
    var pop = popover;
    // Measure then place: below the ref, left-aligned, flipped/clamped to viewport.
    pop.style.left = "0px"; pop.style.top = "0px";
    var pr = pop.getBoundingClientRect();
    var left = Math.min(r.left, window.innerWidth - pr.width - 12);
    if (left < 12) left = 12;
    var top = r.bottom + 8;
    if (top + pr.height > window.innerHeight - 8) {
      var above = r.top - pr.height - 8;
      if (above > 8) top = above; // flip above if it fits better
    }
    pop.style.left = left + "px";
    pop.style.top = top + "px";
  }

  function render(span, ref, text) {
    var pop = ensurePopover();
    pop.querySelector(".esv-pop-ref").textContent = ref;
    pop.querySelector(".esv-pop-body").innerHTML = text;
    if (activeSpan && activeSpan !== span) activeSpan.classList.remove("esv-active");
    activeSpan = span;
    span.classList.add("esv-active");
    pop.classList.add("esv-visible");
    positionPopover(span);
  }

  function show(span) {
    clearTimeout(hideTimer);
    var ref = span.getAttribute("data-ref");
    if (cache[ref]) { render(span, ref, cache[ref]); return; }
    render(span, ref, "Loading…");
    var url = "https://api.esv.org/v3/passage/text/?q=" + encodeURIComponent(ref) +
      "&include-headings=false&include-footnotes=false&include-verse-numbers=true" +
      "&include-short-copyright=false&include-passage-references=false&include-first-verse-numbers=true";
    fetch(url, { headers: { Authorization: "Token " + ESV_API_TOKEN } })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (data) {
        var passage = (data.passages && data.passages[0] || "").trim();
        if (!passage) { cache[ref] = "Passage not found."; }
        else {
          // Bold the inline verse numbers the API returns as [n].
          passage = passage.replace(/\\[(\\d+)\\]/g, "<b>$1</b>");
          cache[ref] = passage;
        }
        if (activeSpan === span) render(span, ref, cache[ref]);
      })
      .catch(function () {
        cache[ref] = "Couldn’t load this passage.";
        if (activeSpan === span) render(span, ref, cache[ref]);
      });
  }

  var isTouch = window.matchMedia("(hover: none)").matches;

  function wireSpan(span) {
    if (isTouch) {
      span.addEventListener("click", function (e) {
        e.preventDefault();
        if (activeSpan === span && popover && popover.classList.contains("esv-visible")) {
          hidePopover();
        } else {
          show(span);
        }
      });
    } else {
      span.addEventListener("mouseenter", function () { show(span); });
      span.addEventListener("mouseleave", scheduleHide);
    }
  }

  function skip(node) {
    for (var el = node.parentElement; el; el = el.parentElement) {
      var tag = el.tagName;
      if (tag === "A" || tag === "CODE" || tag === "PRE" || tag === "SCRIPT" ||
          tag === "STYLE" || tag === "H1" || tag === "H2" || tag === "H3" ||
          el.classList.contains("esv-ref")) return true;
    }
    return false;
  }

  function scan() {
    var root = document.querySelector("article") ||
               document.querySelector(".center") || document.body;
    if (!root) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        if (skip(n)) return NodeFilter.FILTER_REJECT;
        REF_RE.lastIndex = 0;
        return REF_RE.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    var targets = [];
    var t;
    while ((t = walker.nextNode())) targets.push(t);

    targets.forEach(function (node) {
      var text = node.nodeValue;
      var frag = document.createDocumentFragment();
      var last = 0, m;
      REF_RE.lastIndex = 0;
      while ((m = REF_RE.exec(text))) {
        if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
        var span = document.createElement("span");
        span.className = "esv-ref";
        span.setAttribute("data-ref", m[0].replace(/\\.$/, ""));
        span.textContent = m[0];
        wireSpan(span);
        frag.appendChild(span);
        last = m.index + m[0].length;
      }
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      node.parentNode.replaceChild(frag, node);
    });
  }

  function run() {
    if (!ESV_API_TOKEN || ESV_API_TOKEN === "TOKEN_GOES_HERE") return; // not configured yet
    hidePopover();
    scan();
  }

  window.addEventListener("scroll", function () { if (popover && popover.classList.contains("esv-visible")) hidePopover(); }, { passive: true });
  document.addEventListener("nav", run);
  run();
})();
`;

var EsvTooltip = function () {
  var Component = function (_props) {
    return null;
  };
  Component.css = esvTooltipCss;
  Component.afterDOMLoaded = esvTooltipAfterDOMLoaded;
  return Component;
};

export { EsvTooltip };
