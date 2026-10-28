# Book Record (Rekod Bacaan NILAM)

A simple book-information page with server-side sign-in and registration.

## Requirements

- Node.js 20 or newer
- npm
- A deployment environment with persistent disk storage for SQLite

## Run locally

1. Install dependencies:

   ```sh
   npm install
   ```

2. Copy `.env.example` to `.env` and set a unique secret. One way to generate a secret is:

   ```sh
   node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
   ```

3. Start the app:

   ```sh
   npm start
   ```

4. Open http://localhost:3000/register to create an account. Then sign in at http://localhost:3000/login.

The first successful registration creates a user record in the local SQLite database. The book page at `/` requires a signed-in session.

## Important deployment note

This is a Node.js server application, not a static-only site. **GitHub Pages cannot run the server-side authentication code.** Deploy it to a Node-capable host with HTTPS and persistent storage. In production, set `NODE_ENV=production`, `HTTPS_ENABLED=true` only when HTTPS is correctly terminated by the hosting proxy, and set `SESSION_SECRET` in the host's secret/environment settings. Never commit `.env` or database files.

See [AUTHENTICATION_REPORT.md](AUTHENTICATION_REPORT.md) for the component map, request flow, credential/session handling, security boundaries, and test checklist.
