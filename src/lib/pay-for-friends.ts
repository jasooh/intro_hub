// Pay for friends: small helpers for the host views (roster and payments inbox).

type CoverRow = { id: string; status: string; covered_by: string | null };

const HOLDING = ["pending_payment", "confirmed"];

/** "Alex is covering" / "Paid by Alex" on a friend, "Paying for Blake, Casey" on the payer. */
export function coverNote(reg: CoverRow, all: CoverRow[], nameOf: (id: string) => string | undefined): string | undefined {
  if (reg.covered_by) {
    const payer = nameOf(reg.covered_by) ?? "someone";
    if (reg.status === "confirmed") return `Paid by ${payer}`;
    if (reg.status === "pending_payment") return `${payer} is covering`;
    return undefined;
  }
  const friends = all.filter((x) => x.covered_by === reg.id && HOLDING.includes(x.status));
  return friends.length ? `Paying for ${friends.map((f) => nameOf(f.id) ?? "someone").join(", ")}` : undefined;
}

/** E-Transfers in order, each with the shares split off it. A share whose e-Transfer isn't listed stands alone. */
export function nestSplits<T extends { id: string; split_from: string | null }>(payments: T[]): (T & { splits: T[] })[] {
  const ids = new Set(payments.map((p) => p.id));
  return payments
    .filter((p) => !p.split_from || !ids.has(p.split_from))
    .map((p) => ({ ...p, splits: payments.filter((s) => s.split_from === p.id) }));
}
