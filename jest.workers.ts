/**
 * Environment-aware Jest worker and verbose resolvers.
 */

export function resolveMaxWorkers(
  val?: string,
  onWarn?: (message: string) => void
): number | string {
  const hasVal = arguments.length > 0;
  const raw = hasVal ? val : process.env.JEST_MAX_WORKERS;

  if (raw === undefined) {
    return '50%';
  }

  // Valid positive integer
  if (/^[1-9]\d*$/.test(raw)) {
    const num = Number(raw);
    if (Number.isSafeInteger(num)) {
      return num;
    }
  }

  // Valid percentage (1% to 100%)
  const percentMatch = raw.match(/^([1-9]\d*)%$/);
  if (percentMatch) {
    const pct = Number(percentMatch[1]);
    if (pct >= 1 && pct <= 100) {
      return raw;
    }
  }

  // Fallback to 50% with single stderr warning
  const warn = onWarn ?? console.warn;
  const displayVal = raw === '' ? '"" (empty string)' : `"${raw}"`;
  warn(`Invalid JEST_MAX_WORKERS value ${displayVal}. Falling back to 50%.`);
  return '50%';
}

export function resolveVerbose(
  val?: string
): boolean {
  const hasVal = arguments.length > 0;
  const raw = hasVal ? val : process.env.JEST_VERBOSE;
  return raw === 'true';
}
