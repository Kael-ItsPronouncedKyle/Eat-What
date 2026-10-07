/* Pure helpers for the scan screen: the AddItem prefill for a looked-up product and the typed receipt line parser. */
import type { ParsedReceiptLine } from '@/domain/receipts'
import { parseQuantity } from '@/domain/units'
import type { BarcodeProduct } from '@/integrations/ai'

/** A new item name for AddItem: "500 g Black beans" when the package size parses, else just the name. */
export function prefillName(p: BarcodeProduct): string {
  const q = p.quantity ? parseQuantity(`${p.quantity} x`) : null
  const name = p.brand && !p.name.toLowerCase().includes(p.brand.toLowerCase()) ? `${p.brand} ${p.name}` : p.name
  return q && q.unit ? `${q.amount} ${q.unit} ${name}` : name
}

/** Typed receipt lines, one per row: "Eggs 2 @ 2.99", "Milk 3.49", "Paper towels x2 12.99", or just "Bread". */
export function parseTypedLines(text: string): ParsedReceiptLine[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      let rest = line
      let qty: number | null = null
      let unitPriceCents: number | null = null
      let totalCents: number | null = null
      const at = /(\d+(?:\.\d+)?)\s*@\s*\$?(\d+(?:\.\d{1,2})?)\s*$/.exec(rest)
      if (at) {
        qty = Number(at[1])
        unitPriceCents = Math.round(Number(at[2]) * 100)
        totalCents = Math.round(unitPriceCents * qty)
        rest = rest.slice(0, at.index).trim()
      } else {
        const price = /\$?(\d+(?:\.\d{1,2})?)\s*$/.exec(rest)
        if (price && /[.$]/.test(price[0])) {
          totalCents = Math.round(Number(price[1]) * 100)
          rest = rest.slice(0, price.index).trim()
        }
        const times = /\b[x×]\s*(\d+)\s*$|^(\d+)\s*[x×]\s+/i.exec(rest)
        if (times) {
          qty = Number(times[1] ?? times[2])
          rest = rest.replace(times[0], ' ').trim()
        }
        if (totalCents !== null) unitPriceCents = Math.round(totalCents / (qty ?? 1))
      }
      return { name: rest.replace(/[,:-]+$/, '').trim(), qty, unitPriceCents, totalCents }
    })
    .filter((l) => l.name)
}
