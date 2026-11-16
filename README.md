# Studies Hub Bot

A helper for [Studies Hub](https://studieshub.org). It takes the files people upload to the site, reads them, and turns them into
summaries and CBT practice questions, sorted by course. **Claude does the work by hand in a chat session.** There is no server,
no API key and no cost, and the bot never connects to the site. Nothing goes live until the site owner has checked it on the site.

See `HOW-IT-WORKS.md` for a plain-words explanation.

## The loop

```
 Studies Hub (admin: Study bot page)           this repo (a chat with Claude)
 ───────────────────────────────────           ─────────────────────────────
 1. Download batch  ──── batch zip ─────────►  2. unpack ► read ► write drafts ► pack
 4. Upload results zip ◄── results zip ──────  3. out/results-<date>.zip
 5. Check, tick, Approve  ► pages go live (summary + practice test, marked "bot-assisted")
```

| Folder | What lives there |
|---|---|
| `batches/` | The batch zips the owner gave Claude (kept as a record) |
| `inbox/` | The unpacked uploads waiting to be read (`<id>.json` + `inbox/files/`) |
| `work/` | Claude's drafts, one `<id>.json` per item (see `docs/FORMATS.md`) |
| `out/` | The results zip to hand back to the owner |
| `log.md` | A plain list of what was done and when |

## Running a session

1. Owner downloads a batch on the Study bot page and attaches the zip in a chat with Claude: **"process the batch"**.
2. Claude follows `PLAYBOOK.md`.
3. Claude gives the owner `out/results-<date>.zip`; the owner uploads it on the Study bot page and approves what looks right.
4. If Claude's limit runs out mid-batch, nothing is lost: drafts already in `work/` stay, and the next session carries on.

## Tools (plain Node, no packages)

```
node tools/unpack.js <batch.zip>   # batch zip -> inbox/
node tools/validate.js             # check every draft in work/
node tools/pack.js                 # valid drafts -> out/results-<date>.zip
```

## Rules

- No secrets in this repo, ever. The repo may be public.
- Nothing is published without the owner's approval on the site.
- Drafts written from Claude's own knowledge (no upload behind them) are marked `"source": "draft-from-knowledge"` and flagged on the review screen.
