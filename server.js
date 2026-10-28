require("dotenv").config();

const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === "production";
const sessionSecret = process.env.SESSION_SECRET;

if (!sessionSecret || sessionSecret.length < 32) {
  throw new Error("Set SESSION_SECRET to a random value of at least 32 characters. See .env.example.");
}
if (isProduction && process.env.HTTPS_ENABLED !== "true") {
  throw new Error("Production deployment must use HTTPS. Set HTTPS_ENABLED=true only behind a correctly configured HTTPS proxy.");
}

const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(process.env.DB_PATH || path.join(dataDir, "book-record.sqlite"));
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

app.disable("x-powered-by");
if (isProduction) app.set("trust proxy", 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"]
    }
  }
}));
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: false, limit: "10kb" }));
app.use(session({
  name: "bookrecord.sid",
  store: new SQLiteStore({
    db: "sessions.sqlite",
    dir: dataDir,
    table: "sessions"
  }),
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    maxAge: 1000 * 60 * 60 * 2
  }
}));
app.use("/assets", express.static(path.join(__dirname, "public", "assets"), {
  fallthrough: false,
  maxAge: isProduction ? "1h" : 0
}));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many attempts. Please wait and try again." }
});
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many registration attempts. Please try again later." }
});

function csrfToken() {
  return crypto.randomBytes(32).toString("hex");
}
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
function requireCsrf(req, res, next) {
  if (!safeEqual(req.session.csrfToken, req.get("x-csrf-token"))) {
    return res.status(403).json({ error: "Your form expired. Refresh the page and try again." });
  }
  next();
}
function requireAuth(req, res, next) {
  if (!req.session.user) {
    if (req.path.startsWith("/api/")) return res.status(401).json({ error: "Please sign in." });
    return res.redirect("/login");
  }
  next();
}
function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

app.get("/login", (req, res) => {
  if (req.session.user) return res.redirect("/");
  res.sendFile(path.join(__dirname, "public", "login.html"));
});
app.get("/register", (req, res) => {
  if (req.session.user) return res.redirect("/");
  res.sendFile(path.join(__dirname, "public", "register.html"));
});
app.get("/api/csrf", (req, res) => {
  if (!req.session.csrfToken) req.session.csrfToken = csrfToken();
  res.set("Cache-Control", "no-store");
  res.json({ csrfToken: req.session.csrfToken });
});

app.post("/api/register", registerLimiter, requireCsrf, asyncRoute(async (req, res) => {
  const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body.password === "string" ? req.body.password : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }
  if (password.length < 12 || password.length > 72) {
    return res.status(400).json({ error: "Use a password between 12 and 72 characters." });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  try {
    db.prepare("INSERT INTO users (email, password_hash) VALUES (?, ?)").run(email, passwordHash);
  } catch (error) {
    if (error && error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({ error: "An account with that email already exists." });
    }
    throw error;
  }
  res.status(201).json({ message: "Account created. Please sign in." });
}));

app.post("/api/login", loginLimiter, requireCsrf, asyncRoute(async (req, res) => {
  const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body.password === "string" ? req.body.password : "";
  const user = db.prepare("SELECT id, email, password_hash FROM users WHERE email = ?").get(email);
  // Compare even for unknown emails to reduce obvious account-enumeration timing differences.
  const dummyHash = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";
  const passwordOk = await bcrypt.compare(password, user ? user.password_hash : dummyHash);
  if (!user || !passwordOk) return res.status(401).json({ error: "Email or password is incorrect." });

  req.session.regenerate((error) => {
    if (error) return res.status(500).json({ error: "Could not start your session. Please try again." });
    req.session.user = { id: user.id, email: user.email };
    req.session.csrfToken = csrfToken();
    req.session.save((saveError) => {
      if (saveError) return res.status(500).json({ error: "Could not save your session. Please try again." });
      res.set("Cache-Control", "no-store");
      res.json({ message: "Signed in.", redirect: "/" });
    });
  });
}));

app.get("/api/me", requireAuth, (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ user: req.session.user });
});
app.post("/api/logout", requireAuth, requireCsrf, (req, res, next) => {
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie("bookrecord.sid", {
      httpOnly: true,
      secure: isProduction,
      sameSite: "strict"
    });
    res.set("Cache-Control", "no-store");
    res.json({ message: "Signed out.", redirect: "/login" });
  });
});

app.get(["/", "/index.html"], requireAuth, (req, res) => {
  res.set("Cache-Control", "no-store");
  res.sendFile(path.join(__dirname, "index.html"));
});
app.use((req, res) => {
  res.status(404).send("Page not found.");
});
app.use((error, req, res, next) => {
  console.error("Request failed:", error.message);
  if (res.headersSent) return next(error);
  res.status(500).json({ error: "An unexpected server error occurred." });
});

app.listen(PORT, () => {
  console.log(`Book Record is listening on port ${PORT}`);
});
