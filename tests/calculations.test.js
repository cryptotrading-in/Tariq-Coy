import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateLeaveDeduction,
  calculateMess,
  daysInMonth,
  sortByRankAndForceNo,
} from "../src/lib/calculations.js";

test("uses the actual number of days in each month", () => {
  assert.equal(daysInMonth("2026-02"), 28);
  assert.equal(daysInMonth("2028-02"), 29);
  assert.equal(daysInMonth("2026-09"), 30);
  assert.equal(daysInMonth("2026-10"), 31);
});

test("calculates deduction as 7000 / current month days * leave days", () => {
  assert.equal(calculateLeaveDeduction({ monthKey: "2026-10", leaveDays: 4 }), 903);
  assert.equal(calculateLeaveDeduction({ monthKey: "2026-09", leaveDays: 3 }), 700);
  assert.equal(calculateLeaveDeduction({ monthKey: "2028-02", leaveDays: 1 }), 241);
});

test("calculates net mess after deduction for eligible IN staff", () => {
  assert.deepEqual(
    calculateMess({ monthKey: "2026-10", leaveDays: 4, rank: "SI", livingStatus: "IN" }),
    { monthDays: 31, leaveDeduction: 903, messAmount: 6097 },
  );
});

test("DD, AD, INSP and OUT living are exempt from mess", () => {
  assert.equal(calculateMess({ monthKey: "2026-10", leaveDays: 0, rank: "DD", livingStatus: "IN" }).messAmount, 0);
  assert.equal(calculateMess({ monthKey: "2026-10", leaveDays: 0, rank: "AD", livingStatus: "IN" }).messAmount, 0);
  assert.equal(calculateMess({ monthKey: "2026-10", leaveDays: 0, rank: "INSP", livingStatus: "IN" }).messAmount, 0);
  assert.equal(calculateMess({ monthKey: "2026-10", leaveDays: 0, rank: "CPL", livingStatus: "OUT" }).messAmount, 0);
});

test("rejects invalid leave counts and missing living status", () => {
  assert.throws(() => calculateLeaveDeduction({ monthKey: "2026-10", leaveDays: 32 }));
  assert.throws(() => calculateLeaveDeduction({ monthKey: "2026-10", leaveDays: -1 }));
  assert.throws(() => calculateMess({ monthKey: "2026-10", leaveDays: 0, rank: "SI", livingStatus: null }));
});

test("sorts ranks first and numeric Force No in ascending order", () => {
  const input = [
    { rank: "CPL", force_no: "C-100" },
    { rank: "SI", force_no: "US-100" },
    { rank: "SI", force_no: "US-9" },
    { rank: "DD", force_no: "SF-20" },
  ];
  assert.deepEqual(sortByRankAndForceNo(input).map(x => x.force_no), ["SF-20", "US-9", "US-100", "C-100"]);
});
