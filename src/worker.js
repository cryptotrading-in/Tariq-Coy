const COOKIE_NAME = "__Host-tariq_session";
const PBKDF2_ITERATIONS = 100000;
const encoder = new TextEncoder();

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", ...headers },
  });
}
function randomHex(bytes = 32) {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(b, x => x.toString(16).padStart(2, "0")).join("");
}
async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2, "0")).join("");
}
function bytesToBase64(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function base64ToBytes(value) {
  return Uint8Array.from(atob(value), c => c.charCodeAt(0));
}
async function derivePassword(password, saltB64) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: base64ToBytes(saltB64), iterations: PBKDF2_ITERATIONS }, key, 256);
  return bytesToBase64(new Uint8Array(bits));
}
function equalConstantTime(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}
function cookieValue(request, name) {
  const raw = request.headers.get("Cookie") || "";
  for (const part of raw.split(";")) {
    const idx = part.indexOf("=");
    if (idx > -1 && part.slice(0, idx).trim() === name) return part.slice(idx + 1).trim();
  }
  return "";
}
function sessionCookie(value, maxAge) {
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}
function clearCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}
async function readJson(request) {
  const type = request.headers.get("content-type") || "";
  if (!type.includes("application/json")) throw new Error("Content-Type must be application/json");
  const text = await request.text();
  if (text.length > 20000) throw new Error("Request body is too large");
  return JSON.parse(text);
}
function sameOrigin(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return request.method === "GET" || request.method === "HEAD";
  return origin === new URL(request.url).origin;
}
async function audit(db, userId, action, entityType, entityId = "", details = {}) {
  await db.prepare("INSERT INTO audit_log (id, user_id, action, entity_type, entity_id, details_json) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), userId || null, action, entityType, entityId, JSON.stringify(details)).run();
}
async function currentUser(request, env) {
  const token = cookieValue(request, COOKIE_NAME);
  if (!token) return null;
  const tokenHash = await sha256(token);
  const row = await env.DB.prepare(
    "SELECT u.id, u.username, u.role, s.id AS session_id FROM auth_sessions s JOIN app_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at > CURRENT_TIMESTAMP AND u.active=1"
  ).bind(tokenHash).first();
  return row || null;
}
function validUsername(value) {
  return typeof value === "string" && /^[a-zA-Z0-9._-]{3,50}$/.test(value);
}
function validPassword(value) {
  return typeof value === "string" && value.length >= 12 && value.length <= 256;
}
async function handle(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "allow": "GET, POST, OPTIONS" } });
  if (path === "/api/health" && request.method === "GET") {
    try {
      await env.DB.prepare("SELECT 1 AS ok").first();
      return json({ ok: true, database: true });
    } catch {
      return json({ ok: false, database: false }, 503);
    }
  }
  if (!path.startsWith("/api/")) return json({ error: "Not found" }, 404);
  if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method) && !sameOrigin(request)) return json({ error: "Origin check failed" }, 403);

  if (path === "/api/setup-admin" && request.method === "POST") {
    if (!env.BOOTSTRAP_SECRET) return json({ error: "Initial setup is not enabled. Configure BOOTSTRAP_SECRET temporarily." }, 403);
    const supplied = request.headers.get("x-bootstrap-secret") || "";
    if (!equalConstantTime(supplied, env.BOOTSTRAP_SECRET)) return json({ error: "Forbidden" }, 403);
    let body;
    try { body = await readJson(request); } catch { return json({ error: "Invalid JSON request" }, 400); }
    if (!validUsername(body.username) || !validPassword(body.password)) {
      return json({ error: "Use a 3–50 character username and a password of at least 12 characters." }, 400);
    }
    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM app_users").first();
    if (Number(count?.n || 0) > 0) return json({ error: "Initial admin already exists; setup is permanently closed." }, 409);
    const salt = bytesToBase64(crypto.getRandomValues(new Uint8Array(16)));
    const passwordHash = await derivePassword(body.password, salt);
    const id = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO app_users (id, username, password_hash, password_salt, role) VALUES (?, ?, ?, ?, 'admin')")
      .bind(id, body.username, passwordHash, salt).run();
    await audit(env.DB, id, "INITIAL_ADMIN_CREATED", "user", id, { username: body.username });
    return json({ ok: true, message: "Initial administrator created. Remove BOOTSTRAP_SECRET from Worker secrets now." }, 201);
  }

  if (path === "/api/login" && request.method === "POST") {
    let body;
    try { body = await readJson(request); } catch { return json({ error: "Invalid JSON request" }, 400); }
    if (!validUsername(body.username) || typeof body.password !== "string" || body.password.length > 256) {
      return json({ error: "Invalid username or password" }, 400);
    }
    const user = await env.DB.prepare("SELECT * FROM app_users WHERE username=? AND active=1").bind(body.username).first();
    const now = new Date();
    if (user?.locked_until && new Date(user.locked_until) > now) return json({ error: "Too many attempts. Try again later." }, 429);
    let verified = false;
    if (user) {
      const candidate = await derivePassword(body.password, user.password_salt);
      verified = equalConstantTime(candidate, user.password_hash);
    }
    if (!user || !verified) {
      if (user) {
        const failures = Number(user.failed_login_count || 0) + 1;
        const lockedUntil = failures >= 5 ? new Date(now.getTime() + 15 * 60 * 1000).toISOString() : null;
        await env.DB.prepare("UPDATE app_users SET failed_login_count=?, locked_until=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
          .bind(failures >= 5 ? 0 : failures, lockedUntil, user.id).run();
      }
      return json({ error: "Invalid username or password" }, 401);
    }
    await env.DB.prepare("UPDATE app_users SET failed_login_count=0, locked_until=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(user.id).run();
    const token = randomHex(32);
    const tokenHash = await sha256(token);
    const ttlHours = Math.max(1, Math.min(24, Number(env.SESSION_TTL_HOURS || 8)));
    const expiresAt = new Date(now.getTime() + ttlHours * 3600000).toISOString();
    await env.DB.prepare("INSERT INTO auth_sessions (id, user_id, token_hash, expires_at, user_agent_hint) VALUES (?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), user.id, tokenHash, expiresAt, (request.headers.get("User-Agent") || "").slice(0, 250)).run();
    await audit(env.DB, user.id, "LOGIN", "user", user.id);
    return json({ ok: true, user: { id: user.id, username: user.username, role: user.role }, expiresAt }, 200, { "set-cookie": sessionCookie(token, ttlHours * 3600) });
  }

  if (path === "/api/logout" && request.method === "POST") {
    const user = await currentUser(request, env);
    if (user) {
      await env.DB.prepare("UPDATE auth_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE id=?").bind(user.session_id).run();
      await audit(env.DB, user.id, "LOGOUT", "user", user.id);
    }
    return json({ ok: true }, 200, { "set-cookie": clearCookie() });
  }

  if (path === "/api/me" && request.method === "GET") {
    const user = await currentUser(request, env);
    if (!user) return json({ authenticated: false }, 401);
    return json({ authenticated: true, user: { id: user.id, username: user.username, role: user.role } });
  }

  const user = await currentUser(request, env);
  if (!user) return json({ error: "Authentication required" }, 401);
  return json({ error: "API route not implemented yet" }, 501);
}

export default {
  async fetch(request, env) {
    try {
      return await handle(request, env);
    } catch (error) {
      // Do not expose SQL details, passwords, secrets, or stack traces to clients.
      console.error("Request failed", { path: new URL(request.url).pathname, message: String(error?.message || "unknown").slice(0, 180) });
      return json({ error: "Internal server error" }, 500);
    }
  },
};
