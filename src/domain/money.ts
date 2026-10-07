/** Money helpers. All amounts are integer cents. */
export function formatCents(cents: number | null | undefined, opts: { blankWhenNull?: boolean; sign?: boolean } = {}): string {
  if (cents === null || cents === undefined) return opts.blankWhenNull === false ? '$0.00' : ''
  const abs = Math.abs(cents)
  const s = `$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
  if (cents < 0) return `-${s}`
  return opts.sign ? `+${s}` : s
}

export function sumCents(values: (number | null | undefined)[]): number {
  return values.reduce<number>((acc, v) => acc + (v ?? 0), 0)
}
