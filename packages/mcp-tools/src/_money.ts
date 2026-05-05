// Rupees ↔ paise conversion at the tool I/O boundary.
//
// Storage is always integer paise. JSON-RPC I/O is decimal rupees because
// that's what humans (and LLMs) think in. Conversion only happens here —
// inside the DB layer, paise.

export function toPaise(rupees: number): number {
  // Math.round defends against IEEE-754 noise — `Math.round(0.1*100 + 0.2*100)`
  // is 30, while `(0.1 + 0.2) * 100` is 30.000000000000004.
  return Math.round(rupees * 100);
}

export function fromPaise(paise: number | bigint): number {
  return Number(paise) / 100;
}
