/** Share or copy text with the platform's own UI, falling back to the clipboard. Returns what happened. */
export async function shareText(title: string, text: string): Promise<'shared' | 'copied' | 'failed'> {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      await navigator.share({ title, text })
      return 'shared'
    }
  } catch {
    /* user cancelled or share failed; fall through to copy */
  }
  return (await copyText(text)) ? 'copied' : 'failed'
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

export function printText(title: string, text: string): void {
  const w = window.open('', '_blank', 'noopener')
  if (!w) return
  w.document.write(`<!doctype html><title>${escapeHtml(title)}</title><pre style="font: 16px/1.5 system-ui; white-space: pre-wrap; padding: 24px">${escapeHtml(text)}</pre>`)
  w.document.close()
  w.focus()
  w.print()
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}
