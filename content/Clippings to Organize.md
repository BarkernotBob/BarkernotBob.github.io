```dataview
   TABLE author as "Author", published as "Published"
   WHERE contains(file.tags, "#clippings")
   SORT file.ctime asc
   ```
