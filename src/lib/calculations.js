const EXEMPT_MESS_RANKS = new Set(["DD", "AD", "INSP"]);
const RANK_ORDER = ["DD", "AD", "INSP", "SI", "ASI", "SGT", "CPL"];

export function daysInMonth(monthKey) {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) throw new Error("Month must use YYYY-MM format.");
  const [year, month] = monthKey.split("-").map(Number);
  if (month < 1 || month > 12) throw new Error("Month is invalid.");
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function roundMoney(value) {
  if (!Number.isFinite(value)) throw new Error("Amount must be a finite number.");
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateLeaveDeduction({ monthKey, leaveDays, messBase = 7000 }) {
  const days = daysInMonth(monthKey);
  const count = Number(leaveDays);
  const base = Number(messBase);
  if (!Number.isFinite(count) || count < 0 || count > days) {
    throw new Error(`Leave days must be between 0 and ${days} for the selected month.`);
  }
  if (!Number.isFinite(base) || base < 0) throw new Error("Mess base must be a non-negative amount.");
  return roundMoney((base / days) * count);
}

export function calculateMess({ monthKey, leaveDays, rank, livingStatus, messBase = 7000 }) {
  if (!["IN", "OUT"].includes(livingStatus)) {
    throw new Error("Set the employee's Living status to IN or OUT before collection.");
  }
  if (!RANK_ORDER.includes(rank)) throw new Error("Rank is invalid.");
  const base = Number(messBase);
  if (!Number.isFinite(base) || base < 0) throw new Error("Mess base must be a non-negative amount.");
  if (livingStatus === "OUT" || EXEMPT_MESS_RANKS.has(rank)) {
    return { monthDays: daysInMonth(monthKey), leaveDeduction: 0, messAmount: 0 };
  }
  const leaveDeduction = calculateLeaveDeduction({ monthKey, leaveDays, messBase: base });
  return {
    monthDays: daysInMonth(monthKey),
    leaveDeduction,
    messAmount: roundMoney(Math.max(0, base - leaveDeduction)),
  };
}

export function sortByRankAndForceNo(employees) {
  const rankIndex = new Map(RANK_ORDER.map((rank, index) => [rank, index]));
  return [...employees].sort((a, b) => {
    const rankDiff = (rankIndex.get(a.rank) ?? 999) - (rankIndex.get(b.rank) ?? 999);
    if (rankDiff !== 0) return rankDiff;
    const numericA = Number((String(a.force_no).match(/(\d+)$/) || [0, "0"])[1]);
    const numericB = Number((String(b.force_no).match(/(\d+)$/) || [0, "0"])[1]);
    return numericA - numericB || String(a.force_no).localeCompare(String(b.force_no));
  });
}
