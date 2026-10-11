import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/worker.js";

function testEnv({ authenticated = false, employee = null, loginUser = null, bootstrapSecret } = {}) {
  const calls = [];
  const env = {
    __calls: calls,
    DB: {
      prepare(sql) {
        let values = [];
        return {
          bind(...args) { values = args; return this; },
          async first() {
            if (sql.includes("SELECT 1 AS ok")) return { ok: 1 };
            if (authenticated && sql.includes("FROM auth_sessions s JOIN app_users")) {
              return { id: "admin-1", username: "admin", role: "admin", session_id: "session-1" };
            }
            if (sql.includes("SELECT * FROM app_users WHERE username=? AND active=1")) return loginUser;
            if (employee && sql.includes("FROM employees WHERE id=? AND active=1")) return employee;
            return null;
          },
          async all() { return { results: [] }; },
          async run() { calls.push({ sql, values }); return { meta: { changes: 1 } }; },
        };
      },
    },
  };
  if (bootstrapSecret !== undefined) env.BOOTSTRAP_SECRET = bootstrapSecret;
  return env;
}

async function passwordHash(password, saltBase64) {
  const salt = Uint8Array.from(atob(saltBase64), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 100000 }, key, 256);
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}

test("health endpoint confirms the database binding is reachable", async () => {
  const response = await worker.fetch(new Request("https://tariq.example/api/health"), testEnv());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, database: true });
});

test("protected employee API rejects requests without a session", async () => {
  const response = await worker.fetch(new Request("https://tariq.example/api/employees"), testEnv());
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Authentication required" });
});

test("session introspection reports unauthenticated state without a cookie", async () => {
  const response = await worker.fetch(new Request("https://tariq.example/api/me"), testEnv());
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { authenticated: false });
});

test("state-changing requests without an Origin header are rejected", async () => {
  const response = await worker.fetch(new Request("https://tariq.example/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "this-is-a-long-password" }),
  }), testEnv());
  assert.equal(response.status, 403);
});

test("collection is blocked until living status is confirmed as IN or OUT", async () => {
  const response = await worker.fetch(new Request("https://tariq.example/api/collections", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": "https://tariq.example",
      "Cookie": "__Host-tariq_session=test-session-token",
    },
    body: JSON.stringify({ employee_id: "employee-1", month_key: "2026-10", leave_days: 0 }),
  }), testEnv({
    authenticated: true,
    employee: { id: "employee-1", active: 1, rank: "SI", living_status: "UNSET" },
  }));
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    error: "Set this employee's Living IN/OUT status before collection.",
  });
});


test("initial administrator setup stays disabled when bootstrap secret is absent", async () => {
  const response = await worker.fetch(new Request("https://tariq.example/api/setup-admin", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Origin": "https://tariq.example" },
    body: JSON.stringify({ username: "admin", password: "long-enough-password" }),
  }), testEnv());
  assert.equal(response.status, 403);
});

test("successful login issues a secure cookie and stores only a hashed session token", async () => {
  const password = "a-strong-password-123";
  const salt = "MDEyMzQ1Njc4OWFiY2RlZg==";
  const hash = await passwordHash(password, salt);
  const env = testEnv({ loginUser: {
    id: "admin-1", username: "admin", role: "admin", active: 1,
    password_salt: salt, password_hash: hash, failed_login_count: 0, locked_until: null,
  } });
  env.SESSION_TTL_HOURS = "8";
  const response = await worker.fetch(new Request("https://tariq.example/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Origin": "https://tariq.example" },
    body: JSON.stringify({ username: "admin", password }),
  }), env);
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Path=\//);
  const sessionInsert = env.__calls.find(x => x.sql.includes("INSERT INTO auth_sessions"));
  assert.ok(sessionInsert);
  const cookieToken = cookie.match(/__Host-tariq_session=([^;]+)/)[1];
  assert.notEqual(sessionInsert.values[2], cookieToken);
  assert.equal(sessionInsert.values[2].length, 64);
});

test("logout revokes the current session and clears the session cookie", async () => {
  const env = testEnv({ authenticated: true });
  const response = await worker.fetch(new Request("https://tariq.example/api/logout", {
    method: "POST",
    headers: {
      "Origin": "https://tariq.example",
      "Cookie": "__Host-tariq_session=existing-session-token",
    },
  }), env);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie"), /Max-Age=0/);
  assert.ok(env.__calls.some(x => x.sql.includes("UPDATE auth_sessions SET revoked_at")));
});

test("receipt reversal endpoint requires an authenticated administrator", async () => {
  const response = await worker.fetch(new Request("https://tariq.example/api/collections/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/reverse", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": "https://tariq.example",
      "Cookie": "__Host-tariq_session=test-session-token",
    },
    body: JSON.stringify({
      employee_id: "employee-1",
      month_key: "2026-10",
      amount: 7000,
      reason: "Wrong employee",
      confirmation: "REVERSE",
    }),
  }), testEnv());
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Authentication required" });
});

test("receipt reversal requires an exact typed confirmation and a reason", async () => {
  const response = await worker.fetch(new Request("https://tariq.example/api/collections/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/reverse", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": "https://tariq.example",
      "Cookie": "__Host-tariq_session=test-session-token",
    },
    body: JSON.stringify({
      employee_id: "employee-1",
      month_key: "2026-10",
      amount: 7000,
      reason: "Wrong employee",
      confirmation: "reverse",
    }),
  }), testEnv({ authenticated: true }));
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /REVERSE confirmation/);
});

