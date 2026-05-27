---
tags:
  - Person
---
```dataview
TABLE People
WHERE People
FLATTEN People AS p
WHERE contains(p, this.file.name)
```

---

1. **Use the following syntax to reference a person:**
2. People::Spoke with [[Ann Gilbert]] about something

[[Ann Gilbert]]
Test


More text
text
