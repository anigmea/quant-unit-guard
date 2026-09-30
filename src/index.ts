/** Explicit periods; daily means one trading observation, never a calendar day. */
export type Period = 'daily' | 'annual';
export type Scale = 'decimal' | 'percent';
export type Kind = 'volatility' | 'logMean';
export interface Moment { value: number; kind: Kind; period: Period; scale: Scale }
export interface Covariance { values: number[][]; period: Period; scale: Scale }
export class UnitError extends Error { constructor(message: string) { super(message); this.name = 'UnitError'; } }
const requireThat: (ok: unknown, message: string) => asserts ok = (ok, message) => { if (!ok) throw new UnitError(message); };
function finite(n: unknown, label: string): asserts n is number {
  requireThat(typeof n === 'number' && Number.isFinite(n), `${label} must be a finite number, not a numeric string`);
}
function metadata(o: { period: Period; scale: Scale }) {
  requireThat(o && typeof o === 'object', 'Input must be an object with explicit units');
  requireThat(o.period === 'daily' || o.period === 'annual', 'period must be daily or annual');
  requireThat(o.scale === 'decimal' || o.scale === 'percent', 'scale must be decimal or percent');
}
function annualFactor(from: Period, to: Period, observationsPerYear?: number) {
  requireThat(to === 'daily' || to === 'annual', 'target period must be daily or annual');
  if (observationsPerYear !== undefined) {
    finite(observationsPerYear, 'observationsPerYear');
    requireThat(observationsPerYear > 0, 'observationsPerYear must be positive');
  }
  if (from === to) return 1;
  requireThat(observationsPerYear !== undefined, 'Changing period requires explicit observationsPerYear');
  return from === 'daily' ? observationsPerYear : 1 / observationsPerYear;
}
function scaleFactor(from: Scale, to: Scale) {
  requireThat(to === 'decimal' || to === 'percent', 'target scale must be decimal or percent');
  return from === to ? 1 : from === 'percent' ? 0.01 : 100;
}
export function validateMoment(moment: Moment): Moment {
  metadata(moment); finite(moment.value, 'value');
  requireThat(moment.kind === 'volatility' || moment.kind === 'logMean', 'kind must be volatility or logMean');
  if (moment.kind === 'volatility') requireThat(moment.value >= 0, 'volatility must be nonnegative');
  return { ...moment };
}
/** Assumes stationary, uncorrelated increments with finite variance. Not a forecast. */
export function convertMoment(moment: Moment, target: { period: Period; scale: Scale; observationsPerYear?: number }): Moment {
  validateMoment(moment);
  const t = annualFactor(moment.period, target.period, target.observationsPerYear);
  const value = moment.value * scaleFactor(moment.scale, target.scale) * (moment.kind === 'volatility' ? Math.sqrt(t) : t);
  finite(value, 'converted value');
  return { value, kind: moment.kind, period: target.period, scale: target.scale };
}
/** Symmetry/PSD use a relative tolerance normalized to matrix magnitude. */
export function validateCovariance(cov: Covariance, tolerance = 1e-10): Covariance {
  metadata(cov); finite(tolerance, 'tolerance');
  requireThat(tolerance > 0 && tolerance <= 1e-3, 'tolerance must be in (0, 0.001]');
  requireThat(Array.isArray(cov.values) && cov.values.length > 0 && cov.values.length <= 256, 'covariance must have 1-256 rows');
  const n = cov.values.length;
  for (const row of cov.values) {
    requireThat(Array.isArray(row) && row.length === n, 'covariance must be square');
    for (const v of row) finite(v, 'covariance entry');
  }
  const a = cov.values.map(row => [...row]);
  const magnitude = Math.max(...a.flat().map(Math.abs));
  if (magnitude === 0) return { ...cov, values: a };
  for (let i = 0; i < n; i++) {
    requireThat(a[i]![i]! >= 0, 'variance diagonal must be nonnegative');
    for (let j = 0; j < n; j++) {
      requireThat(Math.abs(a[i]![j]! - a[j]![i]!) / magnitude <= tolerance, 'covariance must be symmetric');
    }
  }
  // Symmetrize only the working copy for the PSD test; never repair returned input.
  for (let i = 0; i < n; i++) for (let j = i; j < n; j++) {
    const v = (a[i]![j]! / magnitude + a[j]![i]! / magnitude) / 2;
    a[i]![j] = v; a[j]![i] = v;
  }
  // Pivoted Schur complements: supports singular PSD matrices, unlike strict Cholesky.
  for (let k = 0; k < n; k++) {
    let pivotIndex = k;
    for (let i = k + 1; i < n; i++) if (a[i]![i]! > a[pivotIndex]![pivotIndex]!) pivotIndex = i;
    if (pivotIndex !== k) {
      [a[k], a[pivotIndex]] = [a[pivotIndex]!, a[k]!];
      for (const row of a) [row[k], row[pivotIndex]] = [row[pivotIndex]!, row[k]!];
    }
    const pivot = a[k]![k]!;
    requireThat(pivot >= -tolerance, 'covariance is not positive semidefinite');
    if (pivot <= tolerance) {
      for (let i = k; i < n; i++) for (let j = k; j < n; j++) {
        requireThat(Math.abs(a[i]![j]!) <= tolerance, 'covariance is not positive semidefinite at the chosen tolerance');
      }
      break;
    }
    for (let i = k + 1; i < n; i++) for (let j = i; j < n; j++) {
      const v = a[i]![j]! - a[i]![k]! * a[j]![k]! / pivot;
      a[i]![j] = v; a[j]![i] = v;
    }
  }
  return { ...cov, values: cov.values.map(row => [...row]) };
}
export function convertCovariance(cov: Covariance, target: { period: Period; scale: Scale; observationsPerYear?: number }): Covariance {
  validateCovariance(cov);
  const factor = annualFactor(cov.period, target.period, target.observationsPerYear) * scaleFactor(cov.scale, target.scale) ** 2;
  const values = cov.values.map(row => row.map(v => { const x = v * factor; finite(x, 'converted covariance'); return x; }));
  return { values, period: target.period, scale: target.scale };
}
/** A strict contract check, not an implicit conversion. Asset ordering must be identical. */
export function assertVolCovariance(volatilities: Moment[], cov: Covariance, relativeTolerance = 1e-8): void {
  validateCovariance(cov); finite(relativeTolerance, 'relativeTolerance');
  requireThat(relativeTolerance > 0 && relativeTolerance <= 1e-3, 'relativeTolerance must be in (0, 0.001]');
  requireThat(Array.isArray(volatilities) && volatilities.length === cov.values.length, 'one volatility per covariance row is required');
  volatilities.forEach((v, i) => {
    validateMoment(v);
    requireThat(v.kind === 'volatility', 'expected volatility, not a mean');
    requireThat(v.period === cov.period && v.scale === cov.scale, 'volatility and covariance units do not match; convert explicitly');
    const variance = v.value ** 2; finite(variance, 'squared volatility');
    const diagonal = cov.values[i]![i]!;
    const denominator = Math.max(Math.abs(variance), Math.abs(diagonal));
    requireThat(denominator === 0 || Math.abs(variance - diagonal) / denominator <= relativeTolerance, `volatility ${i} squared does not match covariance diagonal`);
  });
}
