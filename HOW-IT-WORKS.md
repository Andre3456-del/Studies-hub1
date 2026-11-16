# How the Study bot works, in plain words

**The idea.** Students and lecturers upload materials to Studies Hub. Reading all of them, sorting them by course and writing practice
questions is a lot of work. Claude does that work for you, in a chat. This repo is Claude's workshop: the folders and notes it needs to do the job the same way every time.

**Two places, one zip in each direction.** The website and this repo never talk to each other. You are the messenger:

1. **On the website**, open Admin → **Study bot**. You will see every upload nobody has handled yet, grouped by course.
2. Tick the ones you want and tap **Download batch**. You get one zip file with those uploads inside.
3. **In a chat with Claude** (with this repo open), attach that zip and say "process the batch".
4. Claude unpacks it, reads every file, works out the course and topic, and writes a short summary plus multiple-choice practice questions for each.
   Claude then gives you a second zip, the **results zip**.
5. **Back on the website**, Admin → Study bot, upload the results zip in the box at the bottom.
6. The site shows you everything: the summary, every question and the answer. Untick what you do not like and tap **Approve**.
   Only then do pages appear on the site: a summary page and a practice test for each, filed under the right course and marked "bot-assisted".

**Why it is built like this.**
- No API key and no cost: Claude works inside the chat you already use.
- Nothing on your site can be changed without your tap on Approve.
- The bot cannot reach your site, your users or your database, so there is nothing to leak.

**If Claude's limit runs out.** Whatever is finished stays saved in this repo. In the next chat, Claude reads the log and carries on.

**What is in this repo.**
- `PLAYBOOK.md`: the exact steps Claude follows each time.
- `docs/`: the exact shape of the two zip files and of a draft.
- `tools/`: three small helpers (unpack a batch, check the drafts, pack the results).
- `inbox/`, `work/`, `out/`, `batches/`: where files sit while being worked on.
- `log.md`: a running list of what was done.

**What Claude cannot do.** It cannot read very blurry photos, so those come back marked "needs a better file". It can make mistakes in
questions, which is why you check before approving. It handles a limited amount per chat.
