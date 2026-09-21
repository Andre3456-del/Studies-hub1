const express = require('express');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const { DatabaseSync } = require('node:sqlite'); // built into Node 22.13+, nothing to compile
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'site.db'));
db.exec('PRAGMA journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user', created_at TEXT DEFAULT CURRENT_TIMESTAMP, verified INTEGER NOT NULL DEFAULT 0, verify_hash TEXT, verify_expires INTEGER, verify_sent INTEGER);
CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS pages(id INTEGER PRIMARY KEY, slug TEXT UNIQUE NOT NULL, title TEXT NOT NULL, html TEXT NOT NULL, members_only INTEGER NOT NULL DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
`);
// Upgrade older databases that predate email verification
const userCols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
for (const [c, def] of [['verified', 'INTEGER NOT NULL DEFAULT 0'], ['verify_hash', 'TEXT'], ['verify_expires', 'INTEGER'], ['verify_sent', 'INTEGER']])
  if (!userCols.includes(c)) db.exec(`ALTER TABLE users ADD COLUMN ${c} ${def}`);
db.prepare("UPDATE users SET verified=1 WHERE role='admin'").run();
db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());

// Admin account: email defaults to the owner's address; password comes from ADMIN_PASSWORD
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'donryscott28@gmail.com').toLowerCase();
const existingAdmin = db.prepare("SELECT id,email FROM users WHERE role='admin'").get();
if (!existingAdmin) {
  const generated = !process.env.ADMIN_PASSWORD;
  const pass = process.env.ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
  db.prepare('INSERT INTO users(name,email,hash,role,verified) VALUES(?,?,?,?,1)').run('Admin', ADMIN_EMAIL, bcrypt.hashSync(pass, 12), 'admin');
  console.log(`Admin account created: ${ADMIN_EMAIL}` + (generated ? `  password: ${pass}  (set ADMIN_PASSWORD to choose your own)` : ''));
} else if (existingAdmin.email !== ADMIN_EMAIL) {
  db.prepare('UPDATE users SET email=? WHERE id=?').run(ADMIN_EMAIL, existingAdmin.id);
  console.log(`Admin email updated to ${ADMIN_EMAIL}`);
}

const app = express();
app.set('trust proxy', 1);
app.use(express.urlencoded({ extended: false }));

// ---------- helpers ----------
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slugify = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'page';
const safeNext = n => (typeof n === 'string' && /^\/(?!\/)/.test(n) ? n : '');
function uniqueSlug(base) {
  let s = base, i = 2;
  while (db.prepare('SELECT 1 FROM pages WHERE slug=?').get(s)) s = `${base}-${i++}`;
  return s;
}
const fails = new Map();
const recent = ip => (fails.get(ip) || []).filter(t => Date.now() - t < 9e5);
const tooMany = ip => recent(ip).length >= 10;
const noteFail = ip => fails.set(ip, [...recent(ip), Date.now()]);

// ---------- email verification ----------
// Railway blocks SMTP on Free/Trial/Hobby plans, so use an HTTPS email API there (Resend or Brevo).
// SMTP (Gmail etc.) still works on your own computer, a phone, a VPS, or a Railway Pro plan.
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const mailer = process.env.SMTP_HOST ? nodemailer.createTransport({
  host: process.env.SMTP_HOST, port: SMTP_PORT, secure: SMTP_PORT === 465,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
}) : null;
const sha = s => crypto.createHash('sha256').update(s).digest('hex');

async function deliver(to, subject, text, html) {
  const from = process.env.MAIL_FROM || process.env.SMTP_USER;
  if (process.env.RESEND_API_KEY) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, text, html })
    });
    if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
  } else if (process.env.BREVO_API_KEY) {
    const m = /^(.*)<(.+)>\s*$/.exec(from || '');
    const name = m && m[1].trim();
    const sender = m ? { email: m[2].trim(), ...(name ? { name } : {}) } : { email: from };
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender, to: [{ email: to }], subject, textContent: text, htmlContent: html })
    });
    if (!r.ok) throw new Error(`Brevo ${r.status}: ${await r.text()}`);
  } else if (mailer) {
    await mailer.sendMail({ from, to, subject, text, html });
  } else return false;
  return true;
}

async function sendVerification(req, user) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('UPDATE users SET verify_hash=?, verify_expires=?, verify_sent=? WHERE id=?').run(sha(token), Date.now() + 864e5, Date.now(), user.id);
  const base = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
  const link = `${base}/verify?token=${token}`;
  const sent = await deliver(user.email, 'Verify your email for Studies Hub',
    `Hi ${user.name},\n\nConfirm your email to activate your account:\n${link}\n\nThis link expires in 24 hours. If you did not sign up, ignore this email.`,
    `<p>Hi ${esc(user.name)},</p><p><a href="${link}">Confirm your email</a> to activate your account.</p><p>This link expires in 24 hours. If you did not sign up, ignore this email.</p>`);
  if (!sent) console.log(`[email not configured] Verification link for ${user.email}: ${link}`);
}

async function sendSafely(req, u) {
  if (Date.now() - (u.verify_sent || 0) < 60000) return 'wait'; // 1-minute cooldown per account
  try { await sendVerification(req, u); return 'sent'; }
  catch (e) { console.error('Verification email failed:', e.message); return 'fail'; }
}

function startSession(res, userId) {
  const sid = crypto.randomBytes(24).toString('hex');
  db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(sid, userId, Date.now() + 7 * 864e5);
  res.setHeader('Set-Cookie', `sid=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
}

app.use((req, res, next) => {
  const c = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('sid='));
  req.sid = c ? c.slice(4) : null;
  req.user = req.sid
    ? db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires>?').get(req.sid, Date.now()) || null
    : null;
  next();
});

const admin = (req, res, next) =>
  req.user && req.user.role === 'admin' ? next()
    : req.method === 'GET' ? res.redirect('/login?next=/admin') : res.sendStatus(403);

const CSS = `:root{--bg:#12121c;--panel:rgba(32,48,96,.30);--line:rgba(56,176,248,.24);--fg:#eaf2ff;--mut:#93a0bd;--blue:#38b0f8;--blue2:#1c7fe0;--pink:#f000e8;color-scheme:dark;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}
html{background:var(--bg);scroll-padding-top:env(safe-area-inset-top,0px)}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--fg);background:radial-gradient(900px 520px at 12% -8%,rgba(56,176,248,.22),transparent 62%),radial-gradient(700px 440px at 96% 4%,rgba(240,0,232,.13),transparent 60%),var(--bg);background-attachment:fixed}
a{color:var(--blue);text-decoration:none}a:hover{text-decoration:underline}
.top{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 20px;max-width:1000px;margin:0 auto}
.brand{display:flex;align-items:center;gap:10px;color:var(--fg);font-weight:700;font-size:18px}.brand:hover{text-decoration:none}
.logo{width:22px;height:22px;border-radius:6px;background:linear-gradient(135deg,var(--blue),var(--pink));box-shadow:0 0 14px rgba(56,176,248,.7)}
nav{display:flex;align-items:center;gap:10px}nav form{margin:0}
main{max-width:1000px;margin:0 auto;padding:12px 20px 32px}
.btn,button{display:inline-block;font:inherit;font-weight:600;cursor:pointer;color:#04101f;background:linear-gradient(135deg,#5bc8ff,var(--blue) 55%,var(--blue2));border:0;border-radius:10px;padding:9px 18px;margin:6px 0;box-shadow:0 0 18px rgba(56,176,248,.35)}
.btn:hover,button:hover{filter:brightness(1.1);text-decoration:none}
.btn.ghost,button.ghost{background:transparent;color:var(--blue);border:1px solid var(--line);box-shadow:none}
button.link{background:none;color:var(--mut);box-shadow:none;padding:0;margin:0;font-weight:500}button.link:hover{color:var(--blue);filter:none}
input{font:inherit;width:100%;padding:11px 13px;margin:6px 0;color:var(--fg);background:rgba(8,10,22,.65);border:1px solid var(--line);border-radius:10px;outline:0}
input:focus{border-color:var(--blue);box-shadow:0 0 0 3px rgba(56,176,248,.2)}
input::placeholder{color:#6b7794}input[type=checkbox]{width:auto}
.card{display:block;background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:18px;margin:14px 0}
.row{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
.mut{color:var(--mut);font-size:14px}.err{color:#ff7ab8}
h1{font-size:clamp(28px,6vw,44px);line-height:1.15;margin:.2em 0}h2,h3{margin:.8em 0 .3em}.sec{margin-top:28px}
.hero{text-align:center;padding:44px 0 24px}
.eyebrow{color:var(--blue);letter-spacing:3px;text-transform:uppercase;font-size:13px;margin:0}
.grad{background:linear-gradient(90deg,var(--blue),#8ad8ff 50%,var(--pink));-webkit-background-clip:text;background-clip:text;color:transparent}
.lead{color:var(--mut);max-width:520px;margin:12px auto 20px;font-size:18px}
.cta{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px}
.tile{display:flex;flex-direction:column;gap:8px;background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:18px;color:var(--fg);transition:.2s}
.tile:hover{transform:translateY(-3px);border-color:var(--blue);box-shadow:0 0 24px rgba(56,176,248,.25);text-decoration:none}
.tile h3{margin:0;font-size:18px}.go{color:var(--blue);font-size:14px}
.chip{align-self:flex-start;font-size:12px;padding:2px 10px;border-radius:99px;border:1px solid var(--line);color:var(--blue)}
.chip.lock{color:#ff7cf5;border-color:rgba(240,0,232,.45)}
.auth{max-width:420px;margin:28px auto}.auth h1{font-size:30px;text-align:center}.auth>p{text-align:center}.auth .card button{width:100%}
table{width:100%;border-collapse:collapse;font-size:14px}td,th{text-align:left;padding:8px 6px;border-bottom:1px solid var(--line)}th{color:var(--mut);font-weight:500}
footer{text-align:center;color:var(--mut);font-size:13px;padding:20px}`;

const layout = (title, body, user) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${esc(title)}</title><style>${CSS}</style></head><body>
<header class="top"><a class="brand" href="/"><span class="logo"></span>Studies Hub</a><nav>${user
    ? `${user.role === 'admin' ? '<a class="btn ghost" href="/admin">Admin</a>' : ''}<form method="post" action="/logout"><button class="ghost">Log out</button></form>`
    : '<a class="btn ghost" href="/login">Log in</a><a class="btn" href="/signup">Sign up</a>'}</nav></header>
<main>${body}</main><footer>&copy; ${new Date().getFullYear()} Studies Hub</footer></body></html>`;

const authForm = (kind, err = '', next = '') => {
  const login = kind === 'login';
  return layout(login ? 'Log in' : 'Sign up', `<div class="auth"><h1>${login ? 'Welcome back' : 'Create your account'}</h1>
<p class="mut">${login ? 'Log in to open members-only pages.' : 'It is free. We will email you a link to confirm your address.'}</p>${err ? `<p class="err">${esc(err)}</p>` : ''}
<form method="post" class="card">${next ? `<input type="hidden" name="next" value="${esc(next)}">` : ''}
${login ? '' : '<input name="name" placeholder="Your name" required maxlength="80">'}
<input name="email" type="email" placeholder="Email address" required>
<input name="password" type="password" placeholder="Password${login ? '' : ' (8+ characters)'}" required>
<button>${login ? 'Log in' : 'Create account'}</button></form>
<p class="mut">${login ? 'New here? <a href="/signup">Create an account</a>' : 'Already registered? <a href="/login">Log in</a>'}</p></div>`, null);
};

const notice = (title, msg, extra = '') => layout(title, `<div class="auth"><h1>${esc(title)}</h1><p class="mut">${esc(msg)}</p>${extra}</div>`, null);
const resendForm = (email = '') => `<form method="post" action="/resend" class="card"><input name="email" type="email" placeholder="Email" value="${esc(email)}" required><button>Resend verification email</button></form>`;
const checkEmailPage = email => notice('Check your email', `We sent a verification link to ${email}. Click it to activate your account (it expires in 24 hours).`, resendForm(email));

// ---------- public + auth routes ----------
app.get('/', (req, res) => {
  const pages = db.prepare('SELECT slug,title,members_only FROM pages ORDER BY id DESC').all();
  const hero = `<section class="hero"><p class="eyebrow">Welcome</p><h1>Explore our <span class="grad">pages</span></h1>
<p class="lead">Browse what is live, or create a free account to unlock members-only content.</p>${req.user
    ? `<p class="lead">Signed in as ${esc(req.user.name)}.</p>`
    : '<div class="cta"><a class="btn" href="/signup">Create account</a><a class="btn ghost" href="/login">Log in</a></div>'}</section>`;
  const grid = pages.length
    ? `<div class="grid">${pages.map(p => `<a class="tile" href="/p/${p.slug}"><span class="chip${p.members_only ? ' lock' : ''}">${p.members_only ? 'Members' : 'Open'}</span><h3>${esc(p.title)}</h3><span class="go">View page &rarr;</span></a>`).join('')}</div>`
    : '<p class="mut">Nothing published yet. Check back soon.</p>';
  res.send(layout('Studies Hub', `${hero}<h2 class="sec">Pages</h2>${grid}`, req.user));
});

app.get('/p/:slug', (req, res) => {
  const p = db.prepare('SELECT html,members_only FROM pages WHERE slug=?').get(req.params.slug);
  if (!p) return res.status(404).send(layout('Not found', '<h2>Page not found</h2>', req.user));
  if (p.members_only && !req.user) return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
  res.type('html').send(p.html);
});

app.get('/signup', (req, res) => res.send(authForm('signup')));
app.post('/signup', async (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 80);
  const email = String(req.body.email || '').trim().toLowerCase();
  const pw = String(req.body.password || '');
  const bad = m => res.status(400).send(authForm('signup', m));
  if (!name || !/^\S+@\S+\.\S+$/.test(email)) return bad('Enter your name and a valid email.');
  if (pw.length < 8) return bad('Password must be at least 8 characters.');
  let u = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  if (u && u.verified) return bad('That email is already registered. Try logging in.');
  if (!u) { // an existing unverified account is never modified here, only re-sent a link
    const id = db.prepare('INSERT INTO users(name,email,hash) VALUES(?,?,?)').run(name, email, bcrypt.hashSync(pw, 12)).lastInsertRowid;
    u = db.prepare('SELECT * FROM users WHERE id=?').get(id);
  }
  if ((await sendSafely(req, u)) === 'fail') return bad("We couldn't send the verification email. Please try again in a minute.");
  res.send(checkEmailPage(email));
});

app.get('/login', (req, res) => res.send(authForm('login', '', safeNext(req.query.next))));
app.post('/login', (req, res) => {
  const next = safeNext(req.body.next);
  if (tooMany(req.ip)) return res.status(429).send(authForm('login', 'Too many attempts. Try again in 15 minutes.', next));
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(String(req.body.email || '').trim().toLowerCase());
  if (!u || !bcrypt.compareSync(String(req.body.password || ''), u.hash)) {
    noteFail(req.ip);
    return res.status(401).send(authForm('login', 'Wrong email or password.', next));
  }
  if (!u.verified) return res.status(403).send(notice('Verify your email', 'Your email is not verified yet. Check your inbox for the link, or request a new one.', resendForm(u.email)));
  startSession(res, u.id);
  res.redirect(next || (u.role === 'admin' ? '/admin' : '/'));
});

app.get('/verify', (req, res) => {
  const token = String(req.query.token || '');
  const u = token && db.prepare('SELECT id FROM users WHERE verify_hash=? AND verify_expires>?').get(sha(token), Date.now());
  if (!u) return res.status(400).send(notice('Link invalid or expired', 'Request a new verification email below.', resendForm()));
  db.prepare('UPDATE users SET verified=1, verify_hash=NULL, verify_expires=NULL WHERE id=?').run(u.id);
  res.send(notice('Email verified', 'Your account is active.', '<p><a href="/login">Log in</a></p>'));
});

app.post('/resend', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const u = db.prepare('SELECT * FROM users WHERE email=? AND verified=0').get(email);
  if (u) await sendSafely(req, u);
  res.send(notice('Check your email', 'If that address has an unverified account, a new link is on its way.', resendForm(email)));
});

app.post('/logout', (req, res) => {
  if (req.sid) db.prepare('DELETE FROM sessions WHERE id=?').run(req.sid);
  res.setHeader('Set-Cookie', 'sid=; HttpOnly; Path=/; Max-Age=0');
  res.redirect('/');
});

// ---------- admin ----------
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const back = msg => '/admin?msg=' + encodeURIComponent(msg);

app.get('/admin', admin, (req, res) => {
  const pages = db.prepare('SELECT * FROM pages ORDER BY id DESC').all();
  const users = db.prepare('SELECT id,name,email,role,verified,created_at FROM users ORDER BY id DESC').all();
  res.send(layout('Admin', `<h1>Admin</h1>${req.query.msg ? `<p class="mut">${esc(req.query.msg)}</p>` : ''}
<form class="card" method="post" action="/admin/upload" enctype="multipart/form-data"><h3>Upload an HTML page</h3>
<input name="title" placeholder="Title (optional — defaults to file name)">
<input type="file" name="file" accept=".html,.htm,text/html" required>
<label><input type="checkbox" name="members_only" value="1"> Members only (login required)</label><br><button>Upload</button></form>
<h3>Pages (${pages.length})</h3>${pages.map(p => `<div class="card"><div class="row"><a href="/p/${p.slug}" target="_blank">${esc(p.title)}</a><span class="mut">/p/${p.slug}</span></div>
<div class="row" style="margin-top:10px">
<form method="post" action="/admin/pages/${p.id}/toggle"><button class="link">${p.members_only ? '🔒 Members only — make open' : 'Open — make members only'}</button></form>
<form method="post" action="/admin/pages/${p.id}/replace" enctype="multipart/form-data" class="row"><input type="file" name="file" accept=".html,.htm" required style="width:auto"><button>Replace file</button></form>
<form method="post" action="/admin/pages/${p.id}/delete" onsubmit="return confirm('Delete this page?')"><button class="link">Delete</button></form></div></div>`).join('')
    || '<p class="mut">No pages yet.</p>'}
<h3>Registered users (${users.length})</h3><div style="overflow-x:auto"><table><tr><th>Name</th><th>Email</th><th>Joined</th><th>Status</th><th></th></tr>${users.map(u =>
      `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${esc(String(u.created_at).slice(0, 10))}</td><td>${u.verified ? 'verified' : `<form method="post" action="/admin/users/${u.id}/verify"><button class="link">Unverified: verify now</button></form>`}</td><td>${u.role === 'admin' ? 'admin'
        : `<form method="post" action="/admin/users/${u.id}/delete" onsubmit="return confirm('Remove this user?')"><button class="link">Remove</button></form>`}</td></tr>`).join('')}</table></div>`, req.user));
});

app.post('/admin/upload', admin, upload.single('file'), (req, res) => {
  if (!req.file) return res.redirect(back('Choose a file first.'));
  const base = req.file.originalname.replace(/\.html?$/i, '');
  const slug = uniqueSlug(slugify(base));
  db.prepare('INSERT INTO pages(slug,title,html,members_only) VALUES(?,?,?,?)')
    .run(slug, (req.body.title || '').trim() || base, req.file.buffer.toString('utf8'), req.body.members_only ? 1 : 0);
  res.redirect(back(`Published at /p/${slug}`));
});

app.post('/admin/pages/:id/replace', admin, upload.single('file'), (req, res) => {
  if (!req.file) return res.redirect(back('Choose a file first.'));
  db.prepare('UPDATE pages SET html=? WHERE id=?').run(req.file.buffer.toString('utf8'), req.params.id);
  res.redirect(back('File replaced.'));
});
app.post('/admin/pages/:id/toggle', admin, (req, res) => {
  db.prepare('UPDATE pages SET members_only = 1 - members_only WHERE id=?').run(req.params.id);
  res.redirect('/admin');
});
app.post('/admin/pages/:id/delete', admin, (req, res) => {
  db.prepare('DELETE FROM pages WHERE id=?').run(req.params.id);
  res.redirect(back('Page deleted.'));
});
app.post('/admin/users/:id/verify', admin, (req, res) => {
  db.prepare('UPDATE users SET verified=1, verify_hash=NULL, verify_expires=NULL WHERE id=?').run(req.params.id);
  res.redirect(back('User verified.'));
});
app.post('/admin/users/:id/delete', admin, (req, res) => {
  db.prepare("DELETE FROM sessions WHERE user_id=?").run(req.params.id);
  db.prepare("DELETE FROM users WHERE id=? AND role!='admin'").run(req.params.id);
  res.redirect(back('User removed.'));
});

app.use((err, req, res, next) => res.status(400).send(layout('Error', `<h2>Something went wrong</h2><p class="mut">${esc(err.message)} (uploads are limited to 5 MB)</p>`, req.user)));

app.listen(PORT, () => console.log(`Studies Hub running on http://localhost:${PORT}`));
