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
(function () {
  var pageListing = document.querySelector(".page-listing");
  if (!pageListing) return;

  var items = Array.from(document.querySelectorAll(".page-listing .section-li"));
  if (items.length < 2) return;

  // Collect unique tags across all items in this listing
  var tagSet = new Set();
  items.forEach(function (item) {
    item.querySelectorAll(".tag-link").forEach(function (el) {
      var t = (el.textContent || "").trim();
      if (t) tagSet.add(t);
    });
  });

  var tags = Array.from(tagSet).sort();
  if (tags.length < 2) return;

  // Stamp each item with its tags so the click handler can filter
  items.forEach(function (item) {
    var itemTags = Array.from(item.querySelectorAll(".tag-link")).map(function (el) {
      return (el.textContent || "").trim();
    });
    item.setAttribute("data-filter-tags", itemTags.join(" "));
  });

  // Build the filter bar
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

  // Insert immediately before the page listing
  pageListing.parentNode.insertBefore(filterDiv, pageListing);

  filterDiv.addEventListener("click", function (e) {
    var btn = e.target && e.target.closest && e.target.closest(".tag-filter-btn");
    if (!btn) return;

    var tag = btn.getAttribute("data-tag");
    filterDiv.querySelectorAll(".tag-filter-btn").forEach(function (b) {
      b.classList.remove("active");
    });
    btn.classList.add("active");

    items.forEach(function (item) {
      if (tag === "all") {
        item.style.display = "";
      } else {
        var t = (item.getAttribute("data-filter-tags") || "").split(" ");
        item.style.display = t.includes(tag) ? "" : "none";
      }
    });
  });
})();
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
