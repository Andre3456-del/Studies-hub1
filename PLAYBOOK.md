# Playbook: what Claude does each session

Read this first in every new chat. Everything needed to continue is in the folders and in `log.md`.

## 0. Start
- Read `log.md` (last 20 lines) to see where the last session stopped.
- If the owner attached a batch zip: `node tools/unpack.js <path-to-zip>`. Otherwise carry on with what is already in `inbox/` and `work/`.
- Tell the owner how many uploads are waiting. Work oldest first.

## 1. For each item in `inbox/`
1. Read `inbox/<id>.json` (title, course, level, department, kind) and open its file under `inbox/files/` (text, PDF, image, scan: read it properly and look at images).
2. If the file is unreadable or blurry, write `work/<id>.json` with `"status": "needs-better-file"`, `"source": "upload"` and a one-line `notes`. Do not guess.
3. Otherwise write `work/<id>.json` following `docs/FORMATS.md`:
   - `source_ids`: the upload id(s) the draft is based on. The site uses these to file the result under the same course, level and department as the upload.
   - **classify**: course code and title, level, topic, kind (`past-question`, `lecture-note`, `test`, `other`).
   - **summary**: 5 to 10 short lines in plain English.
   - **questions**: multiple choice, exactly 4 different options, one correct answer (0 to 3), a one-line explanation. Only questions the material (or, for drafts, well-known course content) can answer. No trick questions, no duplicates. A page with no sensible questions may have an empty list.
4. Several uploads on one topic may become one draft (list all their ids in `source_ids`).

## 2. Drafts from an outline (no upload)
When the owner gives a course, level and topic list, write drafts the same way with `"source": "draft-from-knowledge"` and no `source_ids`. The owner picks the course, department and level on the site. Never copy text from another website or a textbook. Say plainly when unsure of a fact, and leave that question out rather than guess.

## 3. Hand over
- `node tools/validate.js` and fix anything it reports, then `node tools/pack.js`.
- Send the owner `out/results-<date>.zip` and say what is inside: how many items, any needing a better file, anything you were unsure about.
- The owner uploads it on the Study bot page, ticks what to keep and approves. Nothing is published before that.

## 4. Finish
- Append to `log.md`: date, items read, drafted, left for a better file, and any doubts.
- If the limit ran out, say exactly where work stopped.

## Quality rules
- Accuracy over quantity. Wrong answers hurt students.
- Keep Nigerian university context: course codes, level (100 to 500), exam style.
- Be honest in the log about anything unsure.
