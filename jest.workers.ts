/**
 * Environment-aware Jest worker and verbose resolvers.
 */

export function resolveMaxWorkers(
  val: string | undefined = process.env.JEST_MAX_WORKERS,
  onWarn?: (message: string) => void
): number | string {
  if (val === undefined) {
    return '50%';
  }

  // Valid positive integer
  if (/^[1-9]\d*$/.test(val)) {
    const num = Number(val);
    if (Number.isSafeInteger(num)) {
      return num;
    }
  }

  // Valid percentage (1% to 100%)
  const percentMatch = val.match(/^([1-9]\d*)%$/);
  if (percentMatch) {
    const pct = Number(percentMatch[1]);
    if (pct >= 1 && pct <= 100) {
      return val;
    }
  }

  // Fallback to 50% with single stderr warning
  const warn = onWarn ?? console.warn;
  const displayVal = val === '' ? '"" (empty string)' : `"${val}"`;
  warn(`Invalid JEST_MAX_WORKERS value ${displayVal}. Falling back to 50%.`);
  return '50%';
}

export function resolveVerbose(
  val: string | undefined = process.env.JEST_VERBOSE
): boolean {
  return val === 'true';
}
