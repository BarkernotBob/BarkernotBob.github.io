---
tags:
  - linker-exclude
---


```dataview
TABLE WITHOUT ID key AS "Date", rows.L.text AS "Quotes from the Kids"
FROM "Daily Notes"
FLATTEN file.lists AS L 
WHERE meta(L.section).subpath = "Quotes from the kids" 
GROUP BY file.link
SORT file.cday DESC
```
