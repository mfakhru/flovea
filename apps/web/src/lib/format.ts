export const MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
]

export function formatRupiah(amount: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount)
}

/**
 * Shortened rupiah for tight spots — stat cards on a phone, chart axis
 * labels. `Rp 12,4 jt` instead of `Rp 12.400.000`, which would otherwise
 * overflow a half-width card at 360px. The full value stays in tooltips
 * and on Riwayat, so nothing is ever only available in rounded form.
 */
export function formatRupiahCompact(amount: number) {
  const abs = Math.abs(amount)
  const sign = amount < 0 ? '-' : ''
  const short = (value: number, unit: string) => {
    // one decimal, but drop a trailing ",0" — "Rp 12 jt" beats "Rp 12,0 jt"
    const rounded = Math.round(value * 10) / 10
    const text = Number.isInteger(rounded)
      ? String(rounded)
      : rounded.toFixed(1).replace('.', ',')
    return `${sign}Rp ${text} ${unit}`
  }
  if (abs >= 1_000_000_000) return short(abs / 1_000_000_000, 'M')
  if (abs >= 1_000_000) return short(abs / 1_000_000, 'jt')
  if (abs >= 1_000) return short(abs / 1_000, 'rb')
  return formatRupiah(amount)
}

/**
 * Compact `01/09/26` for the Riwayat table. On a phone only about three of
 * its columns fit at once, so the date — which is frozen and therefore always
 * one of them — has to earn its width; the long `01 Sep 2026` form ate most
 * of it. Headings and dropdowns still use the spelled-out forms below.
 */
export function formatDateShort(iso: string) {
  const [year, month, day] = iso.split('-')
  return `${day}/${month}/${year?.slice(2)}`
}

export function formatPeriod(period: string) {
  const [year, month] = period.split('-')
  const name = MONTHS[Number(month) - 1]
  return name ? `${name} ${year}` : period
}

/** `09/26` — the table-cell form of {@link formatPeriod}. */
export function formatPeriodShort(period: string) {
  const [year, month] = period.split('-')
  return `${month}/${year?.slice(2)}`
}
