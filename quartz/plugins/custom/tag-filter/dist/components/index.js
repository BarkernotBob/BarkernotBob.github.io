// Tag Filter component — returns null (no server-side markup).
// All UI is injected client-side via afterDOMLoaded so the filter bar
// lands in the correct DOM position (between the intro text and the page list).

var tagFilterCss = `
.tag-filter {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-bottom: 1.25rem;
  margin-top: 0.75rem;
}

.tag-filter-btn {
  padding: 0.2rem 0.8rem;
  border: 1.5px solid var(--lightgray);
  border-radius: 999px;
  background: transparent;
  color: var(--gray);
  cursor: pointer;
  font-size: 0.85rem;
  line-height: 1.6;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
  touch-action: manipulation;
}

.tag-filter-btn:hover {
  border-color: var(--secondary);
  color: var(--secondary);
}

.tag-filter-btn.active {
  background: var(--secondary);
  border-color: var(--secondary);
  color: #fff;
}
`;

var tagFilterAfterDOMLoaded = `
// Cache the site-wide content index (slug -> {title, tags}) across SPA navs.
var quartzContentIndex = null;
function quartzLoadIndex() {
  if (quartzContentIndex) return Promise.resolve(quartzContentIndex);
  return fetch("/static/contentIndex.json")
    .then(function (r) { return r.ok ? r.json() : {}; })
    .then(function (d) { quartzContentIndex = d || {}; return quartzContentIndex; })
    .catch(function () { quartzContentIndex = {}; return quartzContentIndex; });
}

// Current folder slug prefix, e.g. "notes/" or "notes/theology/".
function quartzFolderPrefix() {
  var p = decodeURIComponent(location.pathname).replace(/^\\/+/, "").replace(/\\/+$/, "");
  p = p.replace(/\\/index(\\.html)?$/, "").replace(/\\.html$/, "");
  return p === "" ? "" : p + "/";
}

// Descendant notes that live in a SUBFOLDER of the current folder (not direct
// children, not index pages) — these are the ones the shallow listing omits.
function quartzDescendants(prefix, index) {
  var out = [];
  Object.keys(index).forEach(function (slug) {
    if (!slug.startsWith(prefix)) return;
    var rest = slug.slice(prefix.length);
    if (rest === "" || rest.endsWith("index") || !rest.includes("/")) return;
    var meta = index[slug] || {};
    out.push({ slug: slug, title: meta.title || slug, tags: meta.tags || [] });
  });
  return out;
}

function quartzMakeInjectedItem(page) {
  var li = document.createElement("div");
  li.className = "section-li tag-filter-injected";
  var section = document.createElement("div");
  section.className = "section";
  var desc = document.createElement("div");
  desc.className = "desc";
  var h3 = document.createElement("h3");
  var a = document.createElement("a");
  a.className = "internal";
  a.href = "/" + page.slug;
  a.textContent = page.title;
  h3.appendChild(a);
  desc.appendChild(h3);
  section.appendChild(desc);
  var ul = document.createElement("ul");
  ul.className = "tags";
  page.tags.forEach(function (t) {
    var tli = document.createElement("li");
    var ta = document.createElement("a");
    ta.className = "internal tag-link";
    ta.href = "/tags/" + t;
    ta.textContent = t;
    tli.appendChild(ta);
    ul.appendChild(tli);
  });
  section.appendChild(ul);
  li.appendChild(section);
  return li;
}

function quartzBuildTagFilter() {
  // Idempotent: remove any bar / injected rows from a previous render.
  document.querySelectorAll(".tag-filter").forEach(function (el) { el.remove(); });
  document.querySelectorAll(".tag-filter-injected").forEach(function (el) { el.remove(); });

  var pageListing = document.querySelector(".page-listing");
  if (!pageListing) return;

  var items = Array.from(document.querySelectorAll(".page-listing .section-li"));
  var listParent = items.length ? items[0].parentNode : pageListing.querySelector("ul, div");

  quartzLoadIndex().then(function (index) {
    var prefix = quartzFolderPrefix();
    var descendants = quartzDescendants(prefix, index);

    // Union of tags from the shallow items AND from subfolder descendants,
    // so a tag that only exists deeper still gets a pill.
    var tagSet = new Set();
    items.forEach(function (item) {
      item.querySelectorAll(".tag-link").forEach(function (el) {
        var t = (el.textContent || "").trim();
        if (t) tagSet.add(t);
      });
    });
    descendants.forEach(function (p) { p.tags.forEach(function (t) { tagSet.add(t); }); });

    var tags = Array.from(tagSet).sort();
    if (tags.length < 2) return;

    // Stamp shallow items with their own tags for filtering.
    items.forEach(function (item) {
      var itemTags = Array.from(item.querySelectorAll(".tag-link")).map(function (el) {
        return (el.textContent || "").trim();
      });
      item.setAttribute("data-filter-tags", itemTags.join(" "));
    });

    var filterDiv = document.createElement("div");
    filterDiv.className = "tag-filter";

    function makeBtn(tag, label, active) {
      var btn = document.createElement("button");
      btn.className = "tag-filter-btn" + (active ? " active" : "");
      btn.setAttribute("data-tag", tag);
      btn.textContent = label;
      return btn;
    }

    filterDiv.appendChild(makeBtn("all", "All", true));
    tags.forEach(function (tag) {
      var label = tag.charAt(0).toUpperCase() + tag.slice(1);
      filterDiv.appendChild(makeBtn(tag, label, false));
    });

    // Guard against the async race (initial load + nav both resolving):
    // drop any bar that landed while we were fetching, then insert ours.
    document.querySelectorAll(".tag-filter").forEach(function (el) { el.remove(); });
    pageListing.parentNode.insertBefore(filterDiv, pageListing);

    filterDiv.addEventListener("click", function (e) {
      var btn = e.target && e.target.closest && e.target.closest(".tag-filter-btn");
      if (!btn) return;

      var tag = btn.getAttribute("data-tag");
      filterDiv.querySelectorAll(".tag-filter-btn").forEach(function (b) {
        b.classList.remove("active");
      });
      btn.classList.add("active");

      // Clear any previously injected subfolder rows.
      Array.prototype.slice
        .call(document.querySelectorAll(".tag-filter-injected"))
        .forEach(function (el) { el.remove(); });

      if (tag === "all") {
        items.forEach(function (item) { item.style.display = ""; });
        return;
      }

      // Filter the shallow (direct + folder) items.
      items.forEach(function (item) {
        var t = (item.getAttribute("data-filter-tags") || "").split(" ");
        item.style.display = t.includes(tag) ? "" : "none";
      });

      // Drill DOWN: inject matching subfolder notes from the index.
      if (listParent) {
        descendants
          .filter(function (p) { return p.tags.indexOf(tag) !== -1; })
          .forEach(function (p) { listParent.appendChild(quartzMakeInjectedItem(p)); });
      }
    });
  });
}
// Rebuild on every SPA navigation as well as the initial load, so the filter
// bar appears without a manual refresh.
document.addEventListener("nav", quartzBuildTagFilter);
quartzBuildTagFilter();
`;

var TagFilter = function () {
  var Component = function (_props) {
    return null;
  };
  Component.css = tagFilterCss;
  Component.afterDOMLoaded = tagFilterAfterDOMLoaded;
  return Component;
};

export { TagFilter };
