/** Row shape conversion: database snake_case <-> domain camelCase. Values are copied as is (jsonb stays jsonb). */
export function toCamel<T = unknown>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) out[snakeToCamel(k)] = v
  return out as T
}

export function toSnake(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    if (v === undefined) continue
    out[camelToSnake(k)] = v
  }
  return out
}

export function snakeToCamel(s: string): string {
  return s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())
}

export function camelToSnake(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`).replace(/([a-z])([0-9])/g, '$1_$2').replace(/_+/g, '_')
}
