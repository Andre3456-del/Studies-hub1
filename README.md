# Auth Project — Google OAuth + Email Verification + Password Reset

## Setup

1. Extract this zip and run:
   ```
   npm install
   ```

2. Copy `.env.example` to `.env`:
   ```
   cp .env.example .env
   ```

3. Fill in `.env` with your own credentials from the Google Cloud Console
   (APIs & Services → Credentials). **Never commit `.env` or paste real
   keys into chat/logs — rotate immediately if one is ever exposed.**

   You need:
   - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — from an OAuth 2.0 Client ID
   - `GOOGLE_REFRESH_TOKEN` — generated once via the OAuth consent flow
     (needed so the server can send email through Gmail API without you
     re-authenticating every time)
   - `JWT_SECRET` / `SESSION_SECRET` — any long random strings

4. Run the server:
   ```
   npm start
   ```

## Structure

```
auth-project/
├── index.js              # entry point
├── auth/
│   └── google.js         # Google OAuth client + user lookup
├── routes/
│   └── auth.js            # all auth endpoints
├── services/
│   └── email.js           # Gmail-based email sending
├── .env.example            # template — copy to .env and fill in
├── .gitignore
└── package.json
```

## Endpoints

- `GET  /auth/google` — start Google sign-in
- `GET  /auth/google/callback` — OAuth redirect handler
- `POST /auth/send-verification` — send email verification link
- `GET  /auth/verify-email` — verify link handler
- `POST /auth/forgot-password` — send password reset email
- `POST /auth/reset-password` — apply new password

## Still to wire up

The DB calls are commented out (`User.findOrCreate`, `User.markVerified`,
etc.) — plug in your own model/ORM (Mongo, Postgres/Prisma, etc.) where
marked.
