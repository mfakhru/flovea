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
      <h1>Import CSV</h1>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <p className="muted">
          Kolom wajib: <code>date</code> (YYYY-MM-DD), <code>category</code>,{' '}
          <code>detail</code>, <code>amount</code>, <code>notes</code> (opsional),{' '}
          <code>user</code> (username yang sudah terdaftar). Kategori baru otomatis dibuat;
          username yang tidak dikenal akan ditolak per baris.
        </p>
      </div>
      <form className="stack card" onSubmit={handleSubmit}>
        {error && <div className="error">{error}</div>}
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
        <div className="card" style={{ marginTop: '1rem' }}>
          <p>
            <strong>{result.inserted}</strong> baris berhasil diimport.
          </p>
          {result.errors.length > 0 && (
            <>
              <p className="muted">{result.errors.length} baris gagal:</p>
              <table>
                <thead>
                  <tr>
                    <th>Baris</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {result.errors.map((e) => (
                    <tr key={e.row}>
                      <td>{e.row}</td>
                      <td>{e.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
    </main>
  )
}
