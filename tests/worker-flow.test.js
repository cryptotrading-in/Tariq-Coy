import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/worker.js";

function flowEnv({ employee = {}, rate = {}, saved = {}, paymentRecord = null } = {}) {
  const calls = [];
  const env = {
    __calls: calls,
    DB: {
      prepare(sql) {
        let values = [];
        const statement = {
          sql,
          values,
          bind(...args) { values = args; statement.values = args; return statement; },
          async first() {
            calls.push({ kind: "first", sql, values });
            if (sql.includes("SELECT 1 AS ok")) return { ok: 1 };
            if (sql.includes("FROM employees WHERE id=? AND active=1")) return employee.id ? employee : null;
            if (sql.includes("FROM contribution_rates WHERE rank=? AND living_status=?")) return rate.rank ? rate : null;
            if (sql.includes("SELECT * FROM monthly_collections WHERE employee_id=? AND month_key=?")) return saved.id ? saved : null;
            if (sql.includes("SELECT * FROM monthly_collections WHERE id=?")) return paymentRecord;
            if (sql.includes("SELECT amount, payment_date, payment_method FROM payments")) return null;
            return null;
          },
          async all() {
            calls.push({ kind: "all", sql, values });
            if (sql.includes("FROM employees WHERE active=1")) return { results: [{ force_no: "US-9", rank: "SI", name: "Test Employee" }] };
            return { results: [] };
          },
          async run() {
            calls.push({ kind: "run", sql, values });
            return { meta: { changes: 1 } };
          },
        };
        return statement;
      },
      async batch(statements) {
        calls.push({ kind: "batch", statements: statements.map(s => ({ sql: s.sql, values: s.values })) });
        return [{ meta: { changes: 1 } }, { meta: { changes: 1 } }];
      },
    },
  };
  return env;
}

const post = (url, body) => new Request(url, {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: "https://tariq.example" },
  body: JSON.stringify(body),
});

test("collection save calculates October leave deduction using 31 days and persists a single monthly record", async () => {
  const env = flowEnv({
    employee: { id: "employee-1", active: 1, rank: "SI", living_status: "IN" },
    rate: { id: "rate-1", rank: "SI", living_status: "IN", welfare: 220, mod_amount: 220, med: 120, barber: 320, waiter: 200, wman: 480 },
    saved: { id: "collection-1", employee_id: "employee-1", month_key: "2026-10", leave_deduction: 903.23, mess_amount: 6096.77, contribution_total: 1540, total_due: 7636.77 },
  });
  const response = await worker.fetch(post("https://tariq.example/api/collections", {
    employee_id: "employee-1", month_key: "2026-10", leave_days: 4,
  }), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.collection.leave_deduction, 903.23);
  assert.equal(body.collection.mess_amount, 6096.77);
  assert.equal(body.collection.contribution_total, 1540);
  assert.equal(body.collection.total_due, 7636.77);
  const insert = env.__calls.find(c => c.kind === "run" && c.sql.includes("INSERT INTO monthly_collections"));
  assert.ok(insert, "monthly collection insert/upsert should be executed");
  assert.equal(insert.values[2], "2026-10");
  assert.equal(insert.values[13], 4);
  assert.equal(insert.values[14], 903.23);
});

test("OUT living collection has zero mess and zero leave deduction", async () => {
  const env = flowEnv({
    employee: { id: "employee-2", active: 1, rank: "CPL", living_status: "OUT" },
    rate: { id: "rate-2", rank: "CPL", living_status: "OUT", welfare: 150, mod_amount: 150, med: 80, barber: 230, waiter: 0, wman: 0 },
    saved: { id: "collection-2", employee_id: "employee-2", month_key: "2026-09", leave_deduction: 0, mess_amount: 0, contribution_total: 610, total_due: 610 },
  });
  const response = await worker.fetch(post("https://tariq.example/api/collections", {
    employee_id: "employee-2", month_key: "2026-09", leave_days: 5,
  }), env);
  assert.equal(response.status, 200);
  const insert = env.__calls.find(c => c.kind === "run" && c.sql.includes("INSERT INTO monthly_collections"));
  assert.equal(insert.values[14], 0);
  assert.equal(insert.values[16], 0);
  assert.equal(insert.values[17], 610);
});

test("collection cannot be saved when living status has not been confirmed", async () => {
  const env = flowEnv({ employee: { id: "employee-3", active: 1, rank: "SI", living_status: "UNSET" } });
  const response = await worker.fetch(post("https://tariq.example/api/collections", {
    employee_id: "employee-3", month_key: "2026-10", leave_days: 0,
  }), env);
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /Living IN\/OUT status/);
});

test("full payment uses the stored total and writes collection and payment in a D1 batch", async () => {
  const env = flowEnv({
    paymentRecord: { id: "collection-1", month_key: "2026-10", total_due: 7636.77, payment_status: "PENDING" },
  });
  const response = await worker.fetch(post("https://tariq.example/api/collections/collection-1/receive", {
    payment_date: "2026-10-11", payment_method: "Cash",
  }), env);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ok, true);
  const batch = env.__calls.find(c => c.kind === "batch");
  assert.ok(batch);
  assert.match(batch.statements[0].sql, /payment_status='PAID'/);
  assert.match(batch.statements[1].sql, /SELECT \?, id, total_due/);
});

test("payment endpoint rejects partial-payment amounts", async () => {
  const env = flowEnv({
    paymentRecord: { id: "collection-1", month_key: "2026-10", total_due: 7636.77, payment_status: "PENDING" },
  });
  const response = await worker.fetch(post("https://tariq.example/api/collections/collection-1/receive", {
    payment_date: "2026-10-11", payment_method: "Cash", amount: 1000,
  }), env);
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /Partial payments are not supported/);
});

test("nominal role report starts with serial number and blank remarks", async () => {
  const env = flowEnv();
  const response = await worker.fetch(new Request("https://tariq.example/api/reports/nominal-role"), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.rows[0].sr_no, 1);
  assert.equal(body.rows[0].remarks, "");
});
