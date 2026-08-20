import { createFileRoute } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'
import { requireUser } from '../lib/auth'
import { importCsv } from '../lib/expenses'
import type { ImportResult } from '../lib/expenses'

export const Route = createFileRoute('/import')({
  beforeLoad: async () => {
    await requireUser()
  },
  component: ImportPage,
})

function ImportPage() {
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!file) return
    setError(null)
    setResult(null)
    setSubmitting(true)
    try {
      const formData = new FormData()
      formData.set('file', file)
      const res = await importCsv({ data: formData })
      setResult(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import gagal')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="page container">
      <div className="page-head">
        <div>
          <h1>Import CSV</h1>
          <p className="page-subtitle">Upload data pengeluaran secara massal</p>
        </div>
      </div>

      <form className="stack card" onSubmit={handleSubmit}>
        {error && <div className="error">{error}</div>}

        <div className="info-box">
          <strong>Format kolom:</strong> <code>date</code> (YYYY-MM-DD), <code>category</code>,{' '}
          <code>detail</code>, <code>amount</code>, <code>notes</code> (opsional), <code>user</code>{' '}
          (username terdaftar), <code>pay_period</code> (opsional, format YYYY-MM). Kategori baru dibuat
          otomatis; username tak dikenal ditolak per baris.
        </div>

        <div className="field">
          <label htmlFor="file">File CSV</label>
          <input
            id="file"
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            required
          />
        </div>

        <button type="submit" disabled={submitting || !file}>
          {submitting ? 'Mengunggah...' : 'Import'}
        </button>
      </form>

      {result && (
        <div className="card" style={{ marginTop: '1.25rem' }}>
          <p className="result-summary">
            <span>✅</span> {result.inserted} baris berhasil diimport
          </p>
          {result.errors.length > 0 && (
            <>
              <p className="muted" style={{ marginBottom: '0.75rem' }}>
                {result.errors.length} baris gagal:
              </p>
              <div className="table-wrap">
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Baris</th>
                        <th>Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.errors.map((e) => (
                        <tr key={e.row} style={{ cursor: 'default' }}>
                          <td>{e.row}</td>
                          <td style={{ whiteSpace: 'normal' }}>{e.error}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </main>
  )
}
