// ── Exact money arithmetic ────────────────────────────────────────────────────
// All invoice math runs through these helpers. Amounts cross function
// boundaries as rupee numbers (the shape the rest of the app expects), but
// every add/subtract/percentage happens in integer paise so repeated float
// operations can never accumulate drift (0.1 + 0.2 problems, penny gaps
// between line totals and invoice totals, etc).

/** Rupees → integer paise (safe for values up to ~₹90 trillion). */
export function toPaise(rupees: number): number {
  return Math.round((Number(rupees) + Number.EPSILON) * 100)
}

/** Integer paise → rupees. */
export function fromPaise(paise: number): number {
  return paise / 100
}

/** Round a rupee amount to exact paise (replaces ad-hoc `Math.round(x*100)/100`). */
export function roundMoney(value: number): number {
  return fromPaise(toPaise(value))
}

/** Sum rupee amounts exactly (each addend snapped to paise first). */
export function addMoney(...values: number[]): number {
  return fromPaise(values.reduce((sum, value) => sum + toPaise(value), 0))
}

/** a − b in exact paise. */
export function subtractMoney(a: number, b: number): number {
  return fromPaise(toPaise(a) - toPaise(b))
}

/** quantity × unit price, rounded to paise once (quantity may be fractional, e.g. weight). */
export function multiplyMoney(quantity: number, unitPrice: number): number {
  return roundMoney(Number(quantity) * Number(unitPrice))
}

/** `ratePct`% of a rupee amount, computed on exact paise. */
export function percentOfMoney(amount: number, ratePct: number): number {
  return fromPaise(Math.round((toPaise(amount) * Number(ratePct)) / 100))
}
