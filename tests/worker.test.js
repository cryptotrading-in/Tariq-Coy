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

test("health endpoint confirms the database binding is reachable", async () => {
  const response = await worker.fetch(new Request("https://tariq.example/api/health"), testEnv());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, database: true });
});

test("temporary development mode allows the employee list API to load", async () => {
  const response = await worker.fetch(new Request("https://tariq.example/api/employees"), testEnv());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { employees: [] });
});

test("login, setup, session, and logout routes are removed in this development branch", async () => {
  for (const path of ["/api/login", "/api/setup-admin", "/api/me", "/api/logout"]) {
    const response = await worker.fetch(new Request("https://tariq.example" + path), testEnv());
    assert.equal(response.status, 404, path + " should not be available in temporary no-login mode");
  }
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


