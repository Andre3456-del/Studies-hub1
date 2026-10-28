# Studies Hub Bot

A WhatsApp bot for [studieshub.org](https://studieshub.org). You message it what to build or change, it writes the code with Claude, shows you the plan, and after you reply **YES** it pushes the change to your website's GitHub repo. GitHub Pages then publishes it.

## How it works

1. You send a WhatsApp message, e.g. "Add a Chemistry notes page and link it from the homepage".
2. The bot reads your site's files and prepares the changes.
3. It replies with a summary and the list of files. Nothing is live yet.
4. Reply **YES** to publish or **NO** to cancel.
5. On YES, the bot makes one commit to your site repo and sends you the link.

Only the number in `OWNER_PHONE` can control the bot. Messages from any other number are ignored.

## Safety rules built in

- Changes always wait for your approval.
- The bot cannot touch `CNAME`, `.env` files, `.github/` or `.git/`.
- Webhook calls are verified with Meta's signature, so only WhatsApp can reach the bot.
- Unapproved plans expire after 30 minutes.

## Setup

### 1. GitHub token
Create a fine-grained token at GitHub > Settings > Developer settings. Give it access to **only your website repo** with **Contents: Read and write**. This is `GITHUB_TOKEN`. Your website repo is `SITE_REPO` (format `owner/repo`).

### 2. WhatsApp Cloud API
1. Go to developers.facebook.com, create an app, and add the **WhatsApp** product.
2. Under WhatsApp > API Setup, copy the **Phone number ID** (`WHATSAPP_PHONE_ID`) and add your own number as a test recipient.
3. Create a permanent access token (System User) for `WHATSAPP_TOKEN`.
4. Copy the **App secret** from Settings > Basic (`APP_SECRET`).
5. Choose any secret word as `VERIFY_TOKEN`.

### 3. Claude
Create an API key at console.anthropic.com and set it as `ANTHROPIC_API_KEY`.

### 4. Host the bot
GitHub Pages cannot run a bot, so host this repo on a service such as Render or Railway (Node 20 or newer):

- Build command: leave empty (the bot has no dependencies)
- Start command: `npm start`
- Add every variable from `.env.example` in the host's environment settings.

### 5. Connect WhatsApp to the bot
In Meta's WhatsApp > Configuration, set the webhook:

- Callback URL: `https://YOUR-BOT-HOST/webhook`
- Verify token: the same `VERIFY_TOKEN`
- Subscribe to the **messages** field.

Then send "hi" to the bot's WhatsApp number.

## Local testing

```

cp .env.example .env   # fill it in
npm run dev
```

## Files

- `index.js`: web server, WhatsApp webhook, approval flow
- `src/claude.js`: asks Claude to plan the changes
- `src/github.js`: reads the site repo and commits changes
- `src/whatsapp.js`: signature check and sending messages
- `src/paths.js`: blocks protected files
- `src/config.js`: reads settings from environment variables
