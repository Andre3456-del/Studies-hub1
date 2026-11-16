# The two zips

**Batch zip** (made by the Study bot page, given to Claude)
```
batch.json    { version, created, items: [ { id, title, kind, course, dept, level, mime, file, size, uploaded } ], skipped: [] }
files/<id>.<ext>
```

**Results zip** (made by `tools/pack.js`, uploaded on the Study bot page)
```
results.json  { version, created, items: [ <draft>, ... ] }     (draft format: docs/FORMATS.md)
```

The site re-checks every draft on import and shows it to the owner before anything is published. Course, department and level for items with
`source_ids` are taken from the uploaded file on the site, not from the zip.
