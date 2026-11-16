# The two zips

**Batch zip** (made by the Study bot page, given to Claude)
```
batch.json    { version, created, part, parts, items: [ { id, title, kind, course, dept, level, mime, file, size, uploaded } ] }
files/<id>.<ext>
```

A big selection is cut into several batch zips (`part` 1 of `parts`, about 20 MB each; a single large file gets a part of its own). Every selected upload is in exactly one part. Unpack each part with `tools/unpack.js`; the drafts from all parts are packed together later.

**Results zip** (made by `tools/pack.js`, uploaded on the Study bot page)
```
results.json  { version, created, items: [ <draft>, ... ] }     (draft format: docs/FORMATS.md)
```

The site re-checks every draft on import and shows it to the owner before anything is published. Course, department and level for items with
`source_ids` are taken from the uploaded file on the site, not from the zip.
