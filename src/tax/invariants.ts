import type { TaxComputation } from "../domain/return.js";

function assertEqual(label: string, actual: number | null, expected: number | null): void {
  if (actual !== expected) throw new Error(`Tax invariant failed: ${label} expected ${expected}, got ${actual}`);
}

export function assertTaxComputationInvariants(computation: TaxComputation): void {
  const l = computation.lines;
  assertEqual("line1z = line1a", l.line1z, l.line1a);
  assertEqual("line9 = line1z", l.line9, l.line1z);
  assertEqual("line11a = line9", l.line11a, l.line9);
  assertEqual("line11b = line11a", l.line11b, l.line11a);
  assertEqual("line14 = line12e", l.line14, l.line12e);
  assertEqual("line15", l.line15, Math.max(0, l.line11b - l.line14));
  assertEqual("line18 = line16", l.line18, l.line16);
  assertEqual("line22 = line18", l.line22, l.line18);
  assertEqual("line24 = line22", l.line24, l.line22);
  assertEqual("line25d = line25a", l.line25d, l.line25a);
  assertEqual("line33 = line25d", l.line33, l.line25d);

  const refund = l.line33 > l.line24;
  const owed = l.line24 > l.line33;
  const zero = l.line24 === l.line33;
  const active = [refund, owed, zero].filter(Boolean).length;
  if (active !== 1) throw new Error("Exactly one outcome must be active");
  if (refund) {
    assertEqual("refund line34", l.line34, l.line33 - l.line24);
    assertEqual("refund line35a", l.line35a, l.line34);
    assertEqual("refund line37 blank", l.line37, null);
  }
  if (owed) {
    assertEqual("owed line37", l.line37, l.line24 - l.line33);
    assertEqual("owed line34 blank", l.line34, null);
    assertEqual("owed line35a blank", l.line35a, null);
  }
  if (zero) {
    assertEqual("zero line34 blank", l.line34, null);
    assertEqual("zero line35a blank", l.line35a, null);
    assertEqual("zero line37 blank", l.line37, null);
  }
}
