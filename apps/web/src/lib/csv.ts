// Tiny client-side CSV export helper. Builds a CSV string from a matrix of
// rows and triggers a browser download — no server round-trip needed.

type Cell = string | number | null | undefined

function csvCell(value: Cell): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
}

export function toCsv(rows: Cell[][]): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n')
}

export function downloadCsv(filename: string, rows: Cell[][]) {
  const csv = toCsv(rows)
  // Prepend BOM so Excel opens UTF-8 (₹, Hindi) correctly.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`)
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}
