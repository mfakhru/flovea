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

export function formatDate(iso: string) {
  const [year, month, day] = iso.split('-')
  return `${day} ${MONTHS[Number(month) - 1]?.slice(0, 3)} ${year}`
}

export function formatPeriod(period: string) {
  const [year, month] = period.split('-')
  const name = MONTHS[Number(month) - 1]
  return name ? `${name} ${year}` : period
}
