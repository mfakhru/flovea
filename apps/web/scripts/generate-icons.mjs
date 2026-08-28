import sharp from 'sharp'
import { writeFileSync } from 'node:fs'

const SRC = 'logo/logo.png'
const OUT = 'public'
// The "o" of the wordmark — circle + wallet + leaf — is the only part of the
// lockup that stands on its own at icon sizes. Bounds measured off the artwork.
const MARK = { left: 636, top: 279, width: 473, height: 579 }
const CANVAS = 596 // square canvas; the mark is 579 tall, so ~1.5% breathing room

// sharp applies extend after resize, so square it off in its own pass first
const cropped = await sharp(SRC).extract(MARK).png().toBuffer()
const squared = await sharp(cropped)
  .extend({
    top: Math.floor((CANVAS - MARK.height) / 2),
    bottom: Math.ceil((CANVAS - MARK.height) / 2),
    left: Math.floor((CANVAS - MARK.width) / 2),
    right: Math.ceil((CANVAS - MARK.width) / 2),
    background: '#ffffff',
  })
  .png()
  .toBuffer()
const padded = await sharp(squared).resize(1024, 1024).removeAlpha().raw().toBuffer({ resolveWithObject: true })
if (padded.info.width !== 1024 || padded.info.height !== 1024) throw new Error('unexpected mask size')

// Knock out the paper-white backdrop, but only the region connected to the
// border: the wallet inside the circle is nearly the same white and has to stay.
const S = 1024
const { data, info } = padded
const C = info.channels
const bg = [253, 253, 253]
const dist = (i) => Math.hypot(data[i * C] - bg[0], data[i * C + 1] - bg[1], data[i * C + 2] - bg[2])

const outside = new Uint8Array(S * S)
const stack = []
for (let x = 0; x < S; x++) stack.push(x, (S - 1) * S + x)
for (let y = 0; y < S; y++) stack.push(y * S, y * S + S - 1)
while (stack.length) {
  const p = stack.pop()
  if (outside[p] || dist(p) > 60) continue
  outside[p] = 1
  const x = p % S
  const y = (p - x) / S
  if (x > 0) stack.push(p - 1)
  if (x < S - 1) stack.push(p + 1)
  if (y > 0) stack.push(p - S)
  if (y < S - 1) stack.push(p + S)
}

// Feather the cut using colour distance so edges stay anti-aliased.
const rgba = Buffer.alloc(S * S * 4)
for (let p = 0; p < S * S; p++) {
  rgba[p * 4] = data[p * C]
  rgba[p * 4 + 1] = data[p * C + 1]
  rgba[p * 4 + 2] = data[p * C + 2]
  const d = dist(p)
  rgba[p * 4 + 3] = !outside[p] ? 255 : d <= 12 ? 0 : d >= 45 ? 255 : Math.round(((d - 12) / 33) * 255)
}
const mark = () => sharp(rgba, { raw: { width: S, height: S, channels: 4 } })

const opts = { compressionLevel: 9, palette: true, effort: 10 }
const png = (n) => mark().resize(n, n).png(opts).toBuffer()

for (const n of [512, 192]) writeFileSync(`${OUT}/icon-${n}.png`, await png(n))
writeFileSync(`${OUT}/logo-mark.png`, await png(128))

// Full-bleed variants: the OS masks these, so they need an opaque square.
const bleed = async (n, scale) => {
  const inner = Math.round(n * scale)
  const pad = Math.round((n - inner) / 2)
  return sharp({ create: { width: n, height: n, channels: 4, background: '#ffffff' } })
    .composite([{ input: await mark().resize(inner, inner).png().toBuffer(), top: pad, left: pad }])
    .png(opts)
    .toBuffer()
}
writeFileSync(`${OUT}/apple-touch-icon.png`, await bleed(180, 0.94))
writeFileSync(`${OUT}/icon-maskable-512.png`, await bleed(512, 0.66))

// favicon.ico — 16/32/48 PNG entries in an ICO container
const sizes = [16, 32, 48]
const imgs = await Promise.all(sizes.map(png))
const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(sizes.length, 4)
let offset = 6 + 16 * sizes.length
const dir = sizes.map((n, i) => {
  const e = Buffer.alloc(16)
  e[0] = n
  e[1] = n
  e.writeUInt16LE(1, 4)
  e.writeUInt16LE(32, 6)
  e.writeUInt32LE(imgs[i].length, 8)
  e.writeUInt32LE(offset, 12)
  offset += imgs[i].length
  return e
})
writeFileSync(`${OUT}/favicon.ico`, Buffer.concat([header, ...dir, ...imgs]))

console.log('done')
