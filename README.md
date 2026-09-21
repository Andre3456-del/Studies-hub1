# Studies Hub

Host your HTML pages online. Visitors sign up, verify their email, and log in; you manage everything from `/admin`.
Needs Node.js 22.13 or newer. No native modules, so it installs anywhere (including a phone).

## Run it (computer)

```
npm install
ADMIN_PASSWORD='a-long-password' npm start
```

Open http://localhost:3000 and log in at `/login` as `donryscott28@gmail.com` with that password.
(Set `ADMIN_EMAIL` to change the address. The admin password is set on the first start; to reset it, stop the server, delete the `data` folder, and start again.)

## Run it (Android phone, with Termux)

1. Install Termux from F-Droid (f-droid.org). The Play Store version is outdated.
2. In Termux: `termux-setup-storage` (allow access), then `pkg update -y && pkg install -y nodejs unzip`
3. `unzip ~/storage/downloads/html-hub.zip -d ~ && cd ~/html-hub && npm install`
4. `termux-wake-lock`, then `ADMIN_PASSWORD='a-long-password' npm start`
5. Open Chrome on the same phone: http://localhost:3000

To test signup without email, sign up, then log in as admin and tap "Unverified: verify now" next to that user in `/admin`.

## Email verification

New accounts must click an emailed link before they can log in. The site sends it with the first option that is configured:

1. **Resend** (HTTPS API): `RESEND_API_KEY`, `MAIL_FROM` (e.g. `Studies Hub <hello@yourdomain.com>`). To email visitors you must verify a domain you own in Resend.
2. **Brevo** (HTTPS API): `BREVO_API_KEY`, `MAIL_FROM` (a sender address you verified in Brevo).
3. **SMTP** (e.g. Gmail): `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_USER`, `SMTP_PASS` (a Gmail App Password), optional `MAIL_FROM`.

Railway blocks SMTP on Free, Trial and Hobby plans, so use option 1 or 2 there. SMTP is fine on your computer, phone or a VPS.
With nothing configured, the verification link is printed in the server log instead of emailed, and you can verify users by hand in `/admin`.

## Put it online with Railway (no GitHub needed)

Railway can deploy a folder straight from your computer with its CLI:

```
npm i -g @railway/cli
railway login
cd html-hub
railway init
```

Then, in the Railway dashboard, open the new service:

1. **Variables**: `ADMIN_PASSWORD`, `NODE_ENV=production`, plus your email settings (`RESEND_API_KEY` and `MAIL_FROM`, or the Brevo pair).
2. **Volume**: add one and mount it at `/data` (keeps accounts and pages between deploys).
3. **Networking**: click "Generate Domain" to get your public https address.

Back in the terminal run `railway up`. Set the variables and volume before the first deploy.
To use GitHub instead, push this folder to a repo and pick "Deploy from GitHub repo" in Railway.

Other hosts that run Node (Fly.io, a VPS) also work. Static hosts (GitHub Pages, Netlify, Vercel) do not.
Uploaded pages run on the same domain as the site, so only upload HTML you trust.
