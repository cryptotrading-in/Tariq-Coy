import { calculateMess, roundMoney, sortByRankAndForceNo, daysInMonth } from "./lib/calculations.js";

const COOKIE_NAME = "__Host-tariq_session";
const PBKDF2_ITERATIONS = 100000;
const RANKS = ["DD", "AD", "INSP", "SI", "ASI", "SGT", "CPL"];
const EMPLOYEE_FIELDS = [
  "force_no", "rank", "name", "father_name", "date_of_birth", "education", "religion", "caste",
  "joining_date", "current_rank_date", "fsd_joining_date", "blood_group", "mobile_no", "emergency_no",
  "marital_status", "no_of_children", "spouse_no", "courses", "present_address", "permanent_address",
  "domicile", "cnic", "tariq_coy_joining_date", "living_status", "driving_license", "active"
];
const RATE_FIELDS = ["welfare", "mod_amount", "med", "barber", "waiter", "wman"];
const encoder = new TextEncoder();

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "same-origin", ...headers },
  });
}
function randomHex(bytes = 32) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), x => x.toString(16).padStart(2, "0")).join("");
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
  if (!(request.headers.get("content-type") || "").includes("application/json")) throw new Error("Content-Type must be application/json");
  const text = await request.text();
  if (text.length > 30000) throw new Error("Request body is too large");
  return JSON.parse(text);
}
function sameOrigin(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return request.method === "GET" || request.method === "HEAD";
  return origin === new URL(request.url).origin;
}
function validMonth(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}$/.test(value)) return false;
  const [, month] = value.split("-").map(Number);
  return month >= 1 && month <= 12;
}
function validDate(value, optional = false) {
  if ((value === null || value === undefined || value === "") && optional) return true;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function validMoney(value) {
  return Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100000000;
}
async function audit(db, userId, action, entityType, entityId = "", details = {}) {
  await db.prepare("INSERT INTO audit_log (id, user_id, action, entity_type, entity_id, details_json) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), userId || null, action, entityType, entityId, JSON.stringify(details)).run();
}
async function currentUser(request, env) {
  const token = cookieValue(request, COOKIE_NAME);
  if (!token) return null;
  const tokenHash = await sha256(token);
  return await env.DB.prepare(
    "SELECT u.id, u.username, u.role, s.id AS session_id FROM auth_sessions s JOIN app_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at > datetime('now') AND u.active=1"
  ).bind(tokenHash).first() || null;
}
function validUsername(value) {
  return typeof value === "string" && /^[a-zA-Z0-9._-]{3,50}$/.test(value);
}
function validPassword(value) {
  return typeof value === "string" && value.length >= 12 && value.length <= 256;
}
function requireAdmin(user) {
  return user.role === "admin";
}
function rankFromForceSort(rows) {
  return sortByRankAndForceNo(rows);
}
function employeeInput(body, partial = false) {
  const result = {};
  for (const field of EMPLOYEE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, field)) result[field] = body[field];
  }
  if (!partial && (!result.force_no || !result.name || !RANKS.includes(result.rank))) throw new Error("Force No, Name, and a valid Rank are required.");
  if (result.rank !== undefined && !RANKS.includes(result.rank)) throw new Error("Rank is invalid.");
  if (result.living_status !== undefined && !["IN", "OUT", "UNSET"].includes(result.living_status)) throw new Error("Living status must be IN or OUT.");
  if (result.driving_license !== undefined && !["Yes", "No"].includes(result.driving_license)) throw new Error("Driving License must be Yes or No.");
  if (result.no_of_children !== undefined && (!Number.isInteger(Number(result.no_of_children)) || Number(result.no_of_children) < 0)) throw new Error("Number of children must be a non-negative integer.");
  if (result.active !== undefined && ![0, 1, true, false].includes(result.active)) throw new Error("Active status must be true/false or 1/0.");
  for (const field of ["date_of_birth", "joining_date", "current_rank_date", "fsd_joining_date", "tariq_coy_joining_date"]) {
    if (result[field] !== undefined && !validDate(result[field], true)) throw new Error(`${field} must use YYYY-MM-DD internally.`);
  }
  return result;
}
async function getEffectiveRate(env, rank, livingStatus, monthKey) {
  const firstDay = monthKey + "-01";
  return env.DB.prepare(
    "SELECT * FROM contribution_rates WHERE rank=? AND living_status=? AND effective_from<=? ORDER BY effective_from DESC LIMIT 1"
  ).bind(rank, livingStatus, firstDay).first();
}
async function handle(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "allow": "GET, POST, PATCH, OPTIONS" } });
  if (path === "/api/health" && request.method === "GET") {
    try { await env.DB.prepare("SELECT 1 AS ok").first(); return json({ ok: true, database: true }); }
    catch { return json({ ok: false, database: false }, 503); }
  }
  if (!path.startsWith("/api/")) return env.ASSETS ? env.ASSETS.fetch(request) : json({ error: "Not found" }, 404);
  if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method) && !sameOrigin(request)) return json({ error: "Origin check failed" }, 403);

  if (path === "/api/setup-status" && request.method === "GET") {
    try {
      const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM app_users WHERE role='admin' AND password_salt IS NOT NULL").first();
      return json({ setupRequired: Number(count?.n || 0) === 0, setupEnabled: true, setupSecretRequired: Boolean(env.BOOTSTRAP_SECRET) });
    } catch { return json({ error: "Database migrations are not ready." }, 503); }
  }
  if (path === "/api/setup-admin" && request.method === "POST") {
    if (!env.BOOTSTRAP_SECRET) return json({ error: "Initial administrator setup is disabled until a bootstrap secret is configured." }, 403);
    if (!equalConstantTime(request.headers.get("x-bootstrap-secret") || "", env.BOOTSTRAP_SECRET)) {
      return json({ error: "Invalid setup secret" }, 403);
    }
    let body;
    try { body = await readJson(request); } catch { return json({ error: "Invalid JSON request" }, 400); }
    if (!validUsername(body.username) || !validPassword(body.password)) return json({ error: "Use a 3–50 character username and a password of at least 12 characters." }, 400);
    const salt = bytesToBase64(crypto.getRandomValues(new Uint8Array(16)));
    const passwordHash = await derivePassword(body.password, salt);
    const id = crypto.randomUUID();
    // One-time, database-guarded first-admin creation. Once an admin exists, setup closes.
    let created;
    try {
      created = await env.DB.prepare(
        "INSERT INTO app_users (id, username, password_hash, password_salt, role) SELECT ?, ?, ?, ?, 'admin' WHERE NOT EXISTS (SELECT 1 FROM app_users WHERE role='admin' AND password_salt IS NOT NULL)"
      ).bind(id, body.username, passwordHash, salt).run();
    } catch (e) {
      if (String(e.message).includes("UNIQUE")) return json({ error: "That username is already in use." }, 409);
      throw e;
    }
    if (Number(created?.meta?.changes || 0) !== 1) return json({ error: "Initial admin already exists; first-time setup is closed." }, 409);
    await audit(env.DB, id, "INITIAL_ADMIN_CREATED", "user", id, { username: body.username });
    return json({ ok: true, message: "Initial administrator created. Sign in with your new account." }, 201);
  }

  if (path === "/api/login" && request.method === "POST") {
    let body;
    try { body = await readJson(request); } catch { return json({ error: "Invalid JSON request" }, 400); }
    if (!validUsername(body.username) || typeof body.password !== "string" || body.password.length > 256) return json({ error: "Invalid username or password" }, 400);
    const user = await env.DB.prepare("SELECT * FROM app_users WHERE username=? AND active=1").bind(body.username).first();
    const now = new Date();
    if (user?.locked_until && new Date(user.locked_until + (user.locked_until.includes("Z") ? "" : "Z")) > now) return json({ error: "Too many attempts. Try again later." }, 429);
    let verified = false;
    if (user?.password_salt) verified = equalConstantTime(await derivePassword(body.password, user.password_salt), user.password_hash);
    if (!user || !verified) {
      if (user) {
        const failures = Number(user.failed_login_count || 0) + 1;
        const lockedUntil = failures >= 5 ? new Date(now.getTime() + 15 * 60 * 1000).toISOString() : null;
        await env.DB.prepare("UPDATE app_users SET failed_login_count=?, locked_until=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(failures >= 5 ? 0 : failures, lockedUntil, user.id).run();
      }
      return json({ error: "Invalid username or password" }, 401);
    }
    await env.DB.prepare("UPDATE app_users SET failed_login_count=0, locked_until=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(user.id).run();
    const token = randomHex(32);
    const tokenHash = await sha256(token);
    const ttlHours = Math.max(1, Math.min(24, Number(env.SESSION_TTL_HOURS || 8)));
    const expiresAt = new Date(now.getTime() + ttlHours * 3600000).toISOString().replace("T", " ").replace("Z", "");
    await env.DB.prepare("INSERT INTO auth_sessions (id, user_id, token_hash, expires_at, user_agent_hint) VALUES (?, ?, ?, ?, ?)").bind(crypto.randomUUID(), user.id, tokenHash, expiresAt, (request.headers.get("User-Agent") || "").slice(0, 250)).run();
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

  if (path === "/api/employees" && request.method === "GET") {
    const rows = await env.DB.prepare("SELECT * FROM employees WHERE active=1").all();
    return json({ employees: rankFromForceSort(rows.results || []) });
  }
  if (path === "/api/employees" && request.method === "POST") {
    if (!requireAdmin(user)) return json({ error: "Administrator permission required" }, 403);
    let body; try { body = await readJson(request); } catch { return json({ error: "Invalid JSON request" }, 400); }
    let input; try { input = employeeInput(body); } catch (e) { return json({ error: e.message }, 400); }
    const id = crypto.randomUUID();
    const fields = ["id", ...Object.keys(input)];
    const values = [id, ...Object.values(input)];
    try {
      await env.DB.prepare(`INSERT INTO employees (${fields.join(",")}) VALUES (${fields.map(() => "?").join(",")})`).bind(...values).run();
      await audit(env.DB, user.id, "EMPLOYEE_CREATED", "employee", id, { force_no: input.force_no });
      return json({ ok: true, id }, 201);
    } catch (e) {
      if (String(e.message).includes("UNIQUE")) return json({ error: "That Force No already exists." }, 409);
      throw e;
    }
  }

  const employeeMatch = path.match(/^\/api\/employees\/([a-f0-9-]+)$/i);
  if (employeeMatch && request.method === "GET") {
    const id = employeeMatch[1];
    const employee = await env.DB.prepare("SELECT * FROM employees WHERE id=? AND active=1").bind(id).first();
    if (!employee) return json({ error: "Employee not found" }, 404);
    const leaves = await env.DB.prepare("SELECT * FROM leave_records WHERE employee_id=? ORDER BY from_date DESC").bind(id).all();
    return json({ employee, leaveRecords: leaves.results || [] });
  }
  if (employeeMatch && request.method === "PATCH") {
    if (!requireAdmin(user)) return json({ error: "Administrator permission required" }, 403);
    let body; try { body = await readJson(request); } catch { return json({ error: "Invalid JSON request" }, 400); }
    let input; try { input = employeeInput(body, true); } catch (e) { return json({ error: e.message }, 400); }
    const id = employeeMatch[1];
    if (!Object.keys(input).length) return json({ error: "No editable fields supplied" }, 400);
    const sets = Object.keys(input).map(k => `${k}=?`).concat("updated_at=CURRENT_TIMESTAMP").join(", ");
    try {
      const result = await env.DB.prepare(`UPDATE employees SET ${sets} WHERE id=? AND active=1`).bind(...Object.values(input), id).run();
      if (!result.meta?.changes) return json({ error: "Employee not found" }, 404);
      await audit(env.DB, user.id, "EMPLOYEE_UPDATED", "employee", id, { fields: Object.keys(input) });
      return json({ ok: true });
    } catch (e) {
      if (String(e.message).includes("UNIQUE")) return json({ error: "That Force No already exists." }, 409);
      throw e;
    }
  }

  if (employeeMatch && request.method === "DELETE") {
    if (!requireAdmin(user)) return json({ error: "Administrator permission required" }, 403);
    const id = employeeMatch[1];
    const result = await env.DB.prepare("UPDATE employees SET active=0, is_active=0, updated_at=CURRENT_TIMESTAMP WHERE id=? AND active=1").bind(id).run();
    if (!result.meta?.changes) return json({ error: "Employee not found or already archived" }, 404);
    await audit(env.DB, user.id, "EMPLOYEE_ARCHIVED", "employee", id);
    return json({ ok: true, message: "Employee archived. Existing collection and leave history is retained." });
  }

  const restoreMatch = path.match(/^\/api\/employees\/([a-f0-9-]+)\/restore$/i);
  if (restoreMatch && request.method === "POST") {
    if (!requireAdmin(user)) return json({ error: "Administrator permission required" }, 403);
    const id = restoreMatch[1];
    const result = await env.DB.prepare("UPDATE employees SET active=1, is_active=1, updated_at=CURRENT_TIMESTAMP WHERE id=? AND active=0").bind(id).run();
    if (!result.meta?.changes) return json({ error: "Archived employee not found" }, 404);
    await audit(env.DB, user.id, "EMPLOYEE_RESTORED", "employee", id);
    return json({ ok: true });
  }

  const leaveMatch = path.match(/^\/api\/employees\/([a-f0-9-]+)\/leaves$/i);
  if (leaveMatch && request.method === "GET") {
    const rows = await env.DB.prepare("SELECT * FROM leave_records WHERE employee_id=? ORDER BY from_date DESC").bind(leaveMatch[1]).all();
    return json({ leaveRecords: rows.results || [] });
  }
  if (leaveMatch && request.method === "POST") {
    if (!requireAdmin(user)) return json({ error: "Administrator permission required" }, 403);
    let body; try { body = await readJson(request); } catch { return json({ error: "Invalid JSON request" }, 400); }
    const { leave_type, from_date, to_date, days, balance = "", reason = "" } = body;
    const leaveTypeMap = { C_LEAVE: "C/Leave", E_LEAVE: "E/Leave", MEDICAL: "Medical", "C/Leave": "C/Leave", "E/Leave": "E/Leave", Medical: "Medical" };
    const storedLeaveType = leaveTypeMap[leave_type];
    if (!storedLeaveType || !validDate(from_date) || !validDate(to_date) || to_date < from_date || !Number.isInteger(Number(days)) || Number(days) < 0) return json({ error: "Invalid leave type, dates, or days. Dates must be YYYY-MM-DD." }, 400);
    const employee = await env.DB.prepare("SELECT id FROM employees WHERE id=? AND active=1").bind(leaveMatch[1]).first();
    if (!employee) return json({ error: "Employee not found" }, 404);
    const id = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO leave_records (id, employee_id, leave_type, from_date, to_date, days, balance, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, leaveMatch[1], storedLeaveType, from_date, to_date, Number(days), String(balance).slice(0, 100), String(reason).slice(0, 500)).run();
    await audit(env.DB, user.id, "LEAVE_CREATED", "leave_record", id, { employee_id: leaveMatch[1], leave_type });
    return json({ ok: true, id }, 201);
  }

  if (path === "/api/rates" && request.method === "GET") {
    const month = url.searchParams.get("month") || new Date().toISOString().slice(0, 7);
    if (!validMonth(month)) return json({ error: "Month must use YYYY-MM." }, 400);
    const rows = await env.DB.prepare("SELECT r.* FROM contribution_rates r JOIN (SELECT rank, living_status, MAX(effective_from) effective_from FROM contribution_rates WHERE effective_from<=? GROUP BY rank, living_status) latest ON latest.rank=r.rank AND latest.living_status=r.living_status AND latest.effective_from=r.effective_from ORDER BY r.rank, r.living_status")
      .bind(month + "-01").all();
    return json({ month, rates: rows.results || [] });
  }
  if (path === "/api/rates" && request.method === "POST") {
    if (!requireAdmin(user)) return json({ error: "Administrator permission required" }, 403);
    let body; try { body = await readJson(request); } catch { return json({ error: "Invalid JSON request" }, 400); }
    const { rank, living_status, effective_from } = body;
    if (!RANKS.includes(rank) || !["IN", "OUT"].includes(living_status) || !validMonth(effective_from)) return json({ error: "Rank, Living status, or effective month is invalid." }, 400);
    const amounts = {};
    for (const field of RATE_FIELDS) {
      if (!validMoney(body[field] ?? 0)) return json({ error: `${field} must be a non-negative amount.` }, 400);
      amounts[field] = roundMoney(Number(body[field] ?? 0));
    }
    const id = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO contribution_rates (id, rank, living_status, effective_from, welfare, mod_amount, med, barber, waiter, wman) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(rank, living_status, effective_from) DO UPDATE SET welfare=excluded.welfare, mod_amount=excluded.mod_amount, med=excluded.med, barber=excluded.barber, waiter=excluded.waiter, wman=excluded.wman, updated_at=CURRENT_TIMESTAMP")
      .bind(id, rank, living_status, effective_from + "-01", amounts.welfare, amounts.mod_amount, amounts.med, amounts.barber, amounts.waiter, amounts.wman).run();
    await audit(env.DB, user.id, "RATES_SAVED", "contribution_rates", id, { rank, living_status, effective_from });
    return json({ ok: true });
  }

  if (path === "/api/history" && request.method === "GET") {
    const month = url.searchParams.get("month");
    const employeeId = url.searchParams.get("employee_id");
    const status = url.searchParams.get("status");
    const limitRaw = Number(url.searchParams.get("limit") || 100);
    const offsetRaw = Number(url.searchParams.get("offset") || 0);
    if (month && !validMonth(month)) return json({ error: "Month must use YYYY-MM." }, 400);
    if (status && !["PAID", "PENDING"].includes(status)) return json({ error: "Status must be PAID or PENDING." }, 400);
    if (!Number.isInteger(limitRaw) || limitRaw < 1 || limitRaw > 500 || !Number.isInteger(offsetRaw) || offsetRaw < 0) return json({ error: "Invalid pagination values." }, 400);
    const clauses = [];
    const values = [];
    if (month) { clauses.push("c.month_key=?"); values.push(month); }
    if (employeeId) { clauses.push("c.employee_id=?"); values.push(employeeId); }
    if (status) { clauses.push("c.payment_status=?"); values.push(status); }
    const where = clauses.length ? "WHERE " + clauses.join(" AND ") : "";
    const rows = await env.DB.prepare(`SELECT c.*, e.force_no, e.name, e.rank FROM monthly_collections c JOIN employees e ON e.id=c.employee_id ${where} ORDER BY c.month_key DESC, e.rank, e.force_no LIMIT ? OFFSET ?`)
      .bind(...values, limitRaw, offsetRaw).all();
    const grouped = new Map();
    for (const row of rows.results || []) {
      if (!grouped.has(row.month_key)) grouped.set(row.month_key, []);
      grouped.get(row.month_key).push(row);
    }
    const collections = [...grouped.keys()].sort((a, b) => b.localeCompare(a)).flatMap(key => rankFromForceSort(grouped.get(key)));
    return json({ collections, limit: limitRaw, offset: offsetRaw });
  }

  if (path === "/api/collections" && request.method === "GET") {
    const month = url.searchParams.get("month");
    if (!validMonth(month)) return json({ error: "Month query is required in YYYY-MM format." }, 400);
    const rows = await env.DB.prepare("SELECT c.*, e.force_no, e.name, e.rank, (SELECT pe.reason FROM payment_receipt_events pe WHERE pe.collection_id=c.id AND pe.event_type='REVERSED' ORDER BY pe.created_at DESC, pe.rowid DESC LIMIT 1) AS last_reversal_reason, (SELECT pe.created_at FROM payment_receipt_events pe WHERE pe.collection_id=c.id AND pe.event_type='REVERSED' ORDER BY pe.created_at DESC, pe.rowid DESC LIMIT 1) AS last_reversed_at FROM monthly_collections c JOIN employees e ON e.id=c.employee_id WHERE c.month_key=? ORDER BY e.rank, e.force_no").bind(month).all();
    return json({ month, collections: rankFromForceSort(rows.results || []) });
  }
  if (path === "/api/collections" && request.method === "POST") {
    if (!requireAdmin(user)) return json({ error: "Administrator permission required" }, 403);
    let body; try { body = await readJson(request); } catch { return json({ error: "Invalid JSON request" }, 400); }
    const { employee_id, month_key, leave_days = 0, manual_leave_deduction } = body;
    if (!validMonth(month_key) || !employee_id) return json({ error: "Employee and month (YYYY-MM) are required." }, 400);
    const employee = await env.DB.prepare("SELECT * FROM employees WHERE id=? AND active=1").bind(employee_id).first();
    if (!employee) return json({ error: "Employee not found" }, 404);
    if (!["IN", "OUT"].includes(employee.living_status)) return json({ error: "Set this employee's Living IN/OUT status before collection." }, 409);
    const rate = await getEffectiveRate(env, employee.rank, employee.living_status, month_key);
    if (!rate) return json({ error: "No saved contribution rate exists for this rank, living status, and month. Set rates in Settings first." }, 409);
    const amounts = {};
    for (const field of RATE_FIELDS) {
      const requested = body[field] === undefined ? rate[field] : body[field];
      if (!validMoney(requested)) return json({ error: `${field} must be a non-negative amount.` }, 400);
      amounts[field] = roundMoney(Number(requested));
    }
    const contributionTotal = roundMoney(RATE_FIELDS.reduce((sum, key) => sum + amounts[key], 0));
    if (!Number.isFinite(Number(leave_days)) || Number(leave_days) < 0 || Number(leave_days) > daysInMonth(month_key)) return json({ error: "Leave days are invalid for this month." }, 400);
    const messBase = 7000;
    let mess;
    try { mess = calculateMess({ monthKey: month_key, leaveDays: Number(leave_days), rank: employee.rank, livingStatus: employee.living_status, messBase }); }
    catch (e) { return json({ error: e.message }, 400); }
    let leaveDeduction = mess.leaveDeduction;
    let leaveDeductionMode = "automatic";
    if (manual_leave_deduction !== undefined && manual_leave_deduction !== null && manual_leave_deduction !== "") {
      leaveDeductionMode = "manual";
      if (!validMoney(manual_leave_deduction) || Number(manual_leave_deduction) > messBase) return json({ error: "Manual leave deduction must be between zero and the mess base amount." }, 400);
      const exempt = employee.living_status === "OUT" || ["DD", "AD", "INSP"].includes(employee.rank);
      leaveDeduction = exempt ? 0 : roundMoney(Number(manual_leave_deduction));
      mess = { ...mess, leaveDeduction, messAmount: exempt ? 0 : roundMoney(Math.max(0, messBase - leaveDeduction)) };
    }
    const totalDue = roundMoney(contributionTotal + mess.messAmount);
    const id = crypto.randomUUID();
    try {
      const writeResult = await env.DB.prepare("INSERT INTO monthly_collections (id, employee_id, month_key, welfare, mod_amount, med, barber, waiter, wman, contribution_total, living_status_snapshot, rank_snapshot, mess_base, leave_days, leave_deduction, leave_deduction_mode, mess_amount, total_due) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(employee_id, month_key) DO UPDATE SET welfare=excluded.welfare, mod_amount=excluded.mod_amount, med=excluded.med, barber=excluded.barber, waiter=excluded.waiter, wman=excluded.wman, contribution_total=excluded.contribution_total, living_status_snapshot=excluded.living_status_snapshot, rank_snapshot=excluded.rank_snapshot, mess_base=excluded.mess_base, leave_days=excluded.leave_days, leave_deduction=excluded.leave_deduction, leave_deduction_mode=excluded.leave_deduction_mode, mess_amount=excluded.mess_amount, total_due=excluded.total_due, updated_at=CURRENT_TIMESTAMP WHERE monthly_collections.payment_status='PENDING'")
        .bind(id, employee_id, month_key, amounts.welfare, amounts.mod_amount, amounts.med, amounts.barber, amounts.waiter, amounts.wman, contributionTotal, employee.living_status, employee.rank, messBase, Number(leave_days), leaveDeduction, leaveDeductionMode, mess.messAmount, totalDue).run();
      if (!writeResult.meta?.changes) return json({ error: "This month has already been paid and cannot be edited." }, 409);
      const saved = await env.DB.prepare("SELECT * FROM monthly_collections WHERE employee_id=? AND month_key=?").bind(employee_id, month_key).first();
      if (!saved) return json({ error: "Collection could not be saved." }, 500);
      await audit(env.DB, user.id, "COLLECTION_SAVED", "monthly_collection", saved.id, { employee_id, month_key, total_due: totalDue });
      return json({ ok: true, collection: saved }, 200);
    } catch (e) {
      throw e;
    }
  }

  const receiveMatch = path.match(/^\/api\/collections\/([a-f0-9-]+)\/receive$/i);
  if (receiveMatch && request.method === "POST") {
    if (!requireAdmin(user)) return json({ error: "Administrator permission required" }, 403);
    let body; try { body = await readJson(request); } catch { return json({ error: "Invalid JSON request" }, 400); }
    const paymentDate = body.payment_date;
    const paymentMethod = String(body.payment_method || "");
    if (!validDate(paymentDate) || !["Cash", "Bank Transfer", "Other"].includes(paymentMethod)) return json({ error: "Payment date and a valid payment method are required." }, 400);
    if (Object.prototype.hasOwnProperty.call(body, "amount")) return json({ error: "Partial payments are not supported. The full due amount is received only." }, 400);
    const id = receiveMatch[1];
    const record = await env.DB.prepare("SELECT * FROM monthly_collections WHERE id=?").bind(id).first();
    if (!record) return json({ error: "Collection not found" }, 404);
    if (record.payment_status === "PAID") return json({ error: "This collection is already marked paid." }, 409);
    const previousPayment = await env.DB.prepare("SELECT amount, payment_date, payment_method FROM payments WHERE collection_id=?").bind(id).first();
    const paymentId = crypto.randomUUID();
    const eventId = crypto.randomUUID();
    const batchResults = await env.DB.batch([
      env.DB.prepare("UPDATE monthly_collections SET payment_status='PAID', payment_date=?, payment_method=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND payment_status='PENDING'")
        .bind(paymentDate, paymentMethod, id),
      env.DB.prepare("INSERT INTO payments (id, collection_id, amount, payment_date, payment_method, received_by) SELECT ?, id, total_due, ?, ?, ? FROM monthly_collections WHERE id=? AND payment_status='PAID' AND changes()=1 ON CONFLICT(collection_id) DO UPDATE SET id=excluded.id, amount=excluded.amount, payment_date=excluded.payment_date, payment_method=excluded.payment_method, received_by=excluded.received_by")
        .bind(paymentId, paymentDate, paymentMethod, user.id, id),
      env.DB.prepare("INSERT INTO payment_receipt_events (id, event_type, collection_id, receipt_id, employee_id, month_key, amount, payment_date, payment_method, reason, acted_by) SELECT ?, 'RECEIVED', c.id, p.id, c.employee_id, c.month_key, p.amount, p.payment_date, p.payment_method, '', ? FROM monthly_collections c JOIN payments p ON p.collection_id=c.id WHERE c.id=? AND c.payment_status='PAID' AND p.id=? AND changes()=1 AND NOT EXISTS (SELECT 1 FROM payment_receipt_events e WHERE e.receipt_id=p.id AND e.event_type='RECEIVED')")
        .bind(eventId, user.id, id, paymentId),
    ]);
    if (!batchResults[0]?.meta?.changes) return json({ error: "This collection is already marked paid." }, 409);
    const legacyPartial = previousPayment && Number(previousPayment.amount) < Number(record.total_due) - 0.01 ? previousPayment : null;
    await audit(env.DB, user.id, "FULL_PAYMENT_RECEIVED", "monthly_collection", id, { month_key: record.month_key, total_due: record.total_due, payment_method: paymentMethod, receipt_id: paymentId, legacy_partial_payment_replaced: legacyPartial });
    return json({ ok: true, message: "Full payment marked received." });
  }

  const reverseMatch = path.match(/^\/api\/collections\/([a-f0-9-]+)\/reverse$/i);
  if (reverseMatch && request.method === "POST") {
    if (!requireAdmin(user)) return json({ error: "Administrator permission required" }, 403);
    let body; try { body = await readJson(request); } catch { return json({ error: "Invalid JSON request" }, 400); }
    const id = reverseMatch[1];
    const employeeId = String(body.employee_id || "");
    const monthKey = String(body.month_key || "");
    const amount = Number(body.amount);
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : "";
    if (!employeeId || !validMonth(monthKey) || !validMoney(body.amount) || !reason || body.confirmation !== "REVERSE") {
      return json({ error: "Employee, month, exact amount, reason, and REVERSE confirmation are required." }, 400);
    }
    const record = await env.DB.prepare("SELECT c.*, e.force_no, e.name FROM monthly_collections c JOIN employees e ON e.id=c.employee_id WHERE c.id=?").bind(id).first();
    if (!record) return json({ error: "Collection not found" }, 404);
    if (record.employee_id !== employeeId || record.month_key !== monthKey || Math.abs(Number(record.total_due) - amount) > 0.001) {
      return json({ error: "Employee, month, or amount no longer matches this receipt. Refresh and try again." }, 409);
    }
    if (record.payment_status !== "PAID") return json({ error: "This receipt is not currently marked Paid, or it has already been reversed." }, 409);
    const receipt = await env.DB.prepare("SELECT * FROM payments WHERE collection_id=?").bind(id).first();
    if (!receipt) return json({ error: "The original receipt record could not be found." }, 409);
    const eventId = crypto.randomUUID();
    const batchResults = await env.DB.batch([
      env.DB.prepare("UPDATE monthly_collections SET payment_status='PENDING', payment_date=NULL, payment_method=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=? AND employee_id=? AND month_key=? AND payment_status='PAID' AND total_due=?")
        .bind(id, employeeId, monthKey, amount),
      env.DB.prepare("INSERT INTO payment_receipt_events (id, event_type, collection_id, receipt_id, employee_id, month_key, amount, payment_date, payment_method, reason, acted_by) SELECT ?, 'REVERSED', c.id, p.id, c.employee_id, c.month_key, p.amount, p.payment_date, p.payment_method, ?, ? FROM monthly_collections c JOIN payments p ON p.collection_id=c.id WHERE c.id=? AND c.employee_id=? AND c.month_key=? AND c.payment_status='PENDING' AND p.id=? AND changes()=1 AND NOT EXISTS (SELECT 1 FROM payment_receipt_events e WHERE e.receipt_id=p.id AND e.event_type='REVERSED')")
        .bind(eventId, reason, user.id, id, employeeId, monthKey, receipt.id),
    ]);
    if (!batchResults[0]?.meta?.changes) return json({ error: "This receipt was changed or reversed already. Refresh the Collection screen." }, 409);
    await audit(env.DB, user.id, "PAYMENT_RECEIPT_REVERSED", "monthly_collection", id, {
      employee_id: employeeId, employee_name: record.name, force_no: record.force_no,
      month_key: monthKey, amount, receipt_amount: Number(receipt.amount), receipt_id: receipt.id, reason,
    });
    return json({ ok: true, message: "Receipt reversed. The employee is now Pending again." });
  }

  if (path.startsWith("/api/reports/") && request.method === "GET") {
    const report = path.slice("/api/reports/".length);
    const month = url.searchParams.get("month");
    if (month && !validMonth(month)) return json({ error: "Month must use YYYY-MM." }, 400);
    if (report === "nominal-role") {
      const rows = await env.DB.prepare("SELECT force_no, rank, name, '' AS remarks FROM employees WHERE active=1").all();
      return json({ rows: rankFromForceSort(rows.results || []).map((r, i) => ({ sr_no: i + 1, ...r })) });
    }
    if (report === "driving-license") {
      const rows = await env.DB.prepare("SELECT force_no, rank, name, driving_license FROM employees WHERE active=1").all();
      return json({ rows: rankFromForceSort(rows.results || []).map((r, i) => ({ sr_no: i + 1, ...r })) });
    }
    if (report === "leave-medical") {
      const from = url.searchParams.get("from") || "0001-01-01";
      const to = url.searchParams.get("to") || "9999-12-31";
      if (!validDate(from) || !validDate(to) || to < from) return json({ error: "Use a valid date range." }, 400);
      const employees = await env.DB.prepare("SELECT id, force_no, rank, name FROM employees WHERE active=1").all();
      const leaveRows = await env.DB.prepare("SELECT employee_id, leave_type, SUM(days) AS days FROM leave_records WHERE from_date<=? AND to_date>=? GROUP BY employee_id, leave_type").bind(to, from).all();
      const map = new Map();
      for (const row of leaveRows.results || []) {
        if (!map.has(row.employee_id)) map.set(row.employee_id, {});
        map.get(row.employee_id)[row.leave_type] = row.days;
      }
      const rows = rankFromForceSort(employees.results || []).map((e, i) => ({
        sr_no: i + 1, force_no: e.force_no, rank: e.rank, name: e.name,
        c_leave: map.get(e.id)?.["C/Leave"] || 0, e_leave: map.get(e.id)?.["E/Leave"] || 0,
        medical: map.get(e.id)?.Medical || 0, remarks: ""
      }));
      return json({ rows });
    }
    if (["monthly-contribution", "mess", "full-collection"].includes(report)) {
      if (!month) return json({ error: "Month query is required in YYYY-MM format." }, 400);
      // Reports always include all active employees for the selected month.
      // Only PAID collections contribute monetary values to these reports.
      const rows = await env.DB.prepare(`
        SELECT e.id AS employee_id, e.force_no, e.rank, e.name,
          COALESCE(c.payment_status,'PENDING') AS payment_status,
          CASE WHEN c.payment_status='PAID' THEN COALESCE(c.welfare,0) ELSE 0 END AS welfare,
          CASE WHEN c.payment_status='PAID' THEN COALESCE(c.mod_amount,0) ELSE 0 END AS mod_amount,
          CASE WHEN c.payment_status='PAID' THEN COALESCE(c.med,0) ELSE 0 END AS med,
          CASE WHEN c.payment_status='PAID' THEN COALESCE(c.barber,0) ELSE 0 END AS barber,
          CASE WHEN c.payment_status='PAID' THEN COALESCE(c.waiter,0) ELSE 0 END AS waiter,
          CASE WHEN c.payment_status='PAID' THEN COALESCE(c.wman,0) ELSE 0 END AS wman,
          CASE WHEN c.payment_status='PAID' THEN COALESCE(c.contribution_total,0) ELSE 0 END AS contribution_total,
          CASE WHEN c.payment_status='PAID' THEN COALESCE(c.leave_days,0) ELSE COALESCE(c.leave_days,0) END AS leave_days,
          CASE WHEN c.payment_status='PAID' THEN COALESCE(c.leave_deduction,0) ELSE 0 END AS leave_deduction,
          CASE WHEN c.payment_status='PAID' THEN COALESCE(c.mess_amount,0) ELSE 0 END AS mess_amount,
          CASE WHEN c.payment_status='PAID' THEN COALESCE(c.total_due,0) ELSE 0 END AS total_due
        FROM employees e
        LEFT JOIN monthly_collections c ON c.employee_id=e.id AND c.month_key=?
        WHERE e.active=1
      `).bind(month).all();
      const ordered = rankFromForceSort(rows.results || []);
      return json({ rows: ordered.map((r, i) => ({ sr_no: i + 1, ...r })) });
    }
    return json({ error: "Unknown report type." }, 404);
  }

  return json({ error: "Route not found" }, 404);
}

export default {
  async fetch(request, env) {
    try { return await handle(request, env); }
    catch (error) {
      console.error("Request failed", { path: new URL(request.url).pathname, message: String(error?.message || "unknown").slice(0, 180) });
      return json({ error: "Internal server error" }, 500);
    }
  },
};
