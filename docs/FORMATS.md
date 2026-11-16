# Draft file format (`work/<id>.json`)

```json
{
  "id": 123,
  "source": "upload",
  "source_ids": [123, 124],
  "status": "ready",
  "course": { "code": "CSC 201", "title": "Computer Programming I" },
  "level": 200,
  "department": "Computer Science",
  "topic": "Loops and arrays",
  "kind": "past-question",
  "summary": ["First line.", "Second line."],
  "questions": [
    {
      "q": "Which loop always runs its body at least once?",
      "options": ["for", "while", "do-while", "foreach"],
      "answer": 2,
      "explain": "do-while checks the condition after running the body."
    }
  ],
  "notes": "Anything the owner should know (blurry page 3, etc.)"
}
```

Rules checked by `tools/validate.js`:
- `source` is `upload` or `draft-from-knowledge`. Items from uploads need `source_ids`.
- `status` is `ready` or `needs-better-file` (the latter needs `notes`).
- `kind` is `past-question`, `lecture-note`, `test` or `other`.
- `questions` is a list and may be empty.
- Every question has non-empty `q`, exactly 4 distinct `options`, and `answer` is 0 to 3.
- `summary` has at least 1 line when status is `ready`.
