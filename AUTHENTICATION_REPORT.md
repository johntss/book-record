# Authentication Implementation and Security Report

## 1. Scope and repository inspection

The original default branch contained a single static book table in `index.html` and a one-line `README.md`. The retrieved repository did not contain `package.json`, `server.js`, a user database, login routes, session middleware, or token verification. Therefore, no pre-existing authentication flow could be substantiated from those files.

This branch adds a small Node.js/Express authentication layer. It protects the book page when the application is run through the Node server. It does **not** make a GitHub Pages deployment secure: GitHub Pages serves static files and cannot execute `server.js`. Deploy the complete Node application to a host that supports Node.js, HTTPS, and persistent storage.

## 2. Components

| File | Responsibility |
| --- | --- |
| `server.js` | Express server, registration/login/logout endpoints, CSRF checks, session middleware, route protection, rate limits, and security headers |
| `index.html` | Existing book information table, served only after authentication by the Express route |
| `public/login.html` | Sign-in form |
| `public/register.html` | Registration form |
| `public/assets/auth.js` | Calls the server endpoints and displays responses; it does not verify credentials itself |
| `public/assets/auth.css` | Styling for authentication pages |
| `package.json` | Runtime dependencies and start command |
| `.env.example` | Documents required environment variables without containing a real secret |
| `.gitignore` | Excludes environment secrets and local database files |
| `AUTHENTICATION_REPORT.md` | This design and source-reference report |

## 3. Request flow

1. A visitor requests `/login` or `/register`; Express serves the corresponding form.
2. The browser requests `GET /api/csrf`. The server creates a random CSRF token in the server-side session and returns it without caching.
3. The browser submits email and password to `POST /api/register` or `POST /api/login`, with the CSRF token in the `X-CSRF-Token` header.
4. Registration validates the email and password length, hashes the password with bcrypt (cost factor 12), and stores only the hash in SQLite.
5. Login loads the matching account and uses `bcrypt.compare` to verify the submitted password. The server returns a generic incorrect-credentials message if authentication fails.
6. On success, the server regenerates the session ID, records the authenticated user's ID and email in the server-side session, creates a new CSRF token, and saves the session.
7. The browser navigates to `/`. The `requireAuth` middleware checks the server-side session before the book page is returned. `GET /api/me` returns the signed-in user's email.
8. Logout uses a CSRF-protected `POST /api/logout`; the server destroys the session and clears the session cookie.

## 4. Credentials and session/token handling

- **Passwords:** never stored in plaintext. `server.js` hashes passwords with bcrypt before insertion and checks them with bcrypt during login.
- **Session ID:** generated and managed by `express-session`, persisted by `connect-sqlite3` in the local `data/` directory. The browser receives a cookie named `bookrecord.sid`; it contains a session identifier, not the password or user profile.
- **Cookie flags:** `HttpOnly` prevents page JavaScript from reading the session cookie; `SameSite=Strict) helps reduce cross-site request risk; `Secure` is enabled in production so cookies are sent only over HTTPS. Production mode requires `HTTPS_ENABLED=true` and assumes a correctly configured HTTPS proxy.
- **CSRF:** random tokens are held in the session and required for state-changing requests. The comparison uses `crypto.timingSafeEqual` after checking lengths.
- **Expiration and logout:** the cookie has a two-hour max age; rolling sessions refresh its expiry during activity. Logout destroys the server-side session. For high-security or multi-device applications, add an absolute lifetime and account-wide session revocation.
- **Brute force:** login and registration endpoints have per-IP request limits.
- **Other protections:** Helmet security headers, restrictive Content Security Policy, small JSON body limit, generic login failure message, and no-store headers on sensitive responses.
- **Secrets:** `SESSION_SECRET` must be supplied through the deployment environment. Do not commit `.env`, production credentials, or database files.

This implementation uses an opaque server-side session cookie, **not JWTs or bearer access tokens**. That is deliberate: a browser-only book-record application does not need to expose a bearer token to JavaScript.

## 5. Security boundaries and limitations

1. Authentication works only when requests go through `server.js`. If the repository is published directly as static files (for example, GitHub Pages), a user can still read the HTML source. Do not use a static-only deployment for private book records.
2. The SQLite database and session database must live on persistent storage with access controls and backups. Ephemeral serverless filesystems are not suitable without adapting the storage layer.
3. Use HTTPS in production, set a strong unique `SESSION_SECRET`, keep dependencies updated, and review hosting proxy configuration before enabling `trust proxy`.
4. This starter does not include email verification, password reset, multi-factor authentication, account lockout notifications, or administrative roles.
5. Rate limits are per process/IP and may need a shared store for multi-instance deployments.
6. The code should be tested in the intended hosting environment before handling real user accounts.

## 6. Verification checklist

- [ ] `npm install` completes on the deployment runtime.
- [ ] `SESSION_SECRET` is set to a unique random value of at least 32 characters.
- [ ] Registration rejects malformed email addresses and passwords shorter than 12 characters.
- [ ] Database rows contain a bcrypt hash, not the submitted password.
- [ ] Incorrect login returns HTTP 401 without revealing whether an email exists.
- [ ] An unauthenticated request to `/` redirects to `/login`.
- [ ] A successful login regenerates the session and permits access to `/`.
- [ ] Requests that change state without a valid CSRF token are rejected.
- [ ] Logout destroys the session; reusing the old cookie does not restore access.
- [ ] Production runs only over HTTPS and sets the cookie's Secure flag.
- [ ] The app is deployed to a Node-capable host, not GitHub Pages.

## 7. References

- OWASP Authentication Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- OWASP Session Management Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- Express session middleware: https://expressjs.com/en/resources/middleware/session.html
- GitHub Pages overview (static hosting): https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages
