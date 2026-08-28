/**
 * Deep-converts BigInt values to strings so responses survive JSON.stringify.
 * Money travels the wire as strings; the frontend formats with the shared
 * currency-exponent map.
 */
export function serializeBigInts(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(serializeBigInts);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = serializeBigInts(v);
    }
    return out;
  }
  return value;
}
