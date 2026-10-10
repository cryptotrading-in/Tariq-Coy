import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/worker.js";

function testEnv({ authenticated = false, employee = null } = {}) {
  return {
    DB: {
      prepare(sql) {
        return {
          bind() { return this; },
          async first() {
            if (sql.includes("SELECT 1 AS ok")) return { ok: 1 };
            if (authenticated && sql.includes("FROM auth_sessions s JOIN app_users")) {
              return { id: "admin-1", username: "admin", role: "admin", session_id: "session-1" };
            }
            if (employee && sql.includes("FROM employees WHERE id=? AND active=1")) return employee;
            return null;
          },
          async all() { return { results: [] }; },
          async run() { return { meta: { changes: 0 } }; },
        };
      },
    },
  };
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
