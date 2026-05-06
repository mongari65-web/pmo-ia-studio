// lib/exportUtils.ts
// Universal export helpers for all PMO-IA Studio tabs

// ─── PRINT ────────────────────────────────────────────────────────────────────
export function printSection(elementId: string, title: string) {
  const el = document.getElementById(elementId)
  if (!el) return
  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(`
    <!DOCTYPE html><html><head>
    <title>${title}</title>
    <style>
      body { font-family: 'Segoe UI', sans-serif; padding: 24px; color: #1e293b; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid #cbd5e1; padding: 8px 12px; font-size: 12px; }
      th { background: #1e40af; color: white; }
      tr:nth-child(even) { background: #f8fafc; }
      h1 { color: #1e40af; font-size: 18px; margin-bottom: 16px; }
      @media print { body { padding: 0; } }
    </style>
    </head><body>
    <h1>${title}</h1>
    ${el.innerHTML}
    </body></html>
  `)
  win.document.close()
  win.focus()
  setTimeout(() => win.print(), 500)
}

// ─── EXCEL ────────────────────────────────────────────────────────────────────
export function exportToExcel(
  rows: Record<string, unknown>[],
  filename: string,
  sheetName = 'Export'
) {
  if (!rows.length) return
  const headers = Object.keys(rows[0])
  const csvRows = [
    headers.join('\t'),
    ...rows.map(r => headers.map(h => {
      const v = r[h] ?? ''
      return typeof v === 'string' && v.includes('\t') ? `"${v}"` : String(v)
    }).join('\t'))
  ]
  const blob = new Blob(['\uFEFF' + csvRows.join('\n')], {
    type: 'application/vnd.ms-excel;charset=utf-8'
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}.xls`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── PDF (via print dialog with PDF option) ───────────────────────────────────
export function exportToPDF(elementId: string, title: string) {
  // Same as print but adds PDF hint in title
  printSection(elementId, `${title} — PDF`)
}

// ─── GOOGLE DRIVE (open picker or upload via API) ─────────────────────────────
export async function exportToDrive(
  content: string,
  filename: string,
  mimeType = 'text/plain'
) {
  // Calls the Anthropic API (Claude) to trigger the Google Drive MCP
  try {
    const res = await fetch('/api/drive-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, filename, mimeType })
    })
    const data = await res.json()
    if (data.url) window.open(data.url, '_blank')
    return data
  } catch {
    alert('Export Drive : configurez la route /api/drive-upload avec le MCP Google Drive.')
  }
}

// ─── NOTION ────────────────────────────────────────────────────────────────────
export async function exportToNotion(
  title: string,
  blocks: Record<string, unknown>[]
) {
  try {
    const res = await fetch('/api/notion-export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, blocks })
    })
    const data = await res.json()
    if (data.url) window.open(data.url, '_blank')
    return data
  } catch {
    alert('Export Notion : configurez la route /api/notion-export avec le MCP Notion.')
  }
}

// ─── GMAIL ─────────────────────────────────────────────────────────────────────
export function exportToGmail(subject: string, body: string) {
  const encoded = encodeURIComponent(body)
  const sub = encodeURIComponent(subject)
  window.open(`https://mail.google.com/mail/?view=cm&su=${sub}&body=${encoded}`, '_blank')
}

// ─── GENERIC JSON DOWNLOAD ─────────────────────────────────────────────────────
export function downloadJSON(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}.json`
  a.click()
  URL.revokeObjectURL(url)
}
