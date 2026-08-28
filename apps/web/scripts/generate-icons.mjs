import sharp from 'sharp'
import { writeFileSync } from 'node:fs'

const SRC = 'logo/logo.png'
const OUT = 'public'
// The full lockup — "flo", the wallet mark, and the tagline. Bounds are the
// artwork's ink, measured off the source; the file itself carries wide margins.
const INK = { left: 182, top: 269, width: 927, height: 702 }
const SIDE = 1000 // square working canvas, ~4% margin around the lockup
const PAD = { left: Math.round((SIDE - INK.width) / 2), top: Math.round((SIDE - INK.height) / 2) }

const cropped = await sharp(SRC).extract(INK).png().toBuffer()
const squared = await sharp(cropped)
  .extend({
    left: PAD.left,
    right: SIDE - INK.width - PAD.left,
    top: PAD.top,
    bottom: SIDE - INK.height - PAD.top,
    background: '#ffffff',
  })
  .removeAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true })

const { data, info } = squared
const C = info.channels
if (info.width !== SIDE || info.height !== SIDE) throw new Error('unexpected canvas size')

// Knock out the paper-white backdrop, but only the region connected to the
// border: the wallet inside the mark is nearly the same white and has to stay.
const bg = [253, 253, 253]
const dist = (i) => Math.hypot(data[i * C] - bg[0], data[i * C + 1] - bg[1], data[i * C + 2] - bg[2])
const outside = new Uint8Array(SIDE * SIDE)
const stack = []
for (let x = 0; x < SIDE; x++) stack.push(x, (SIDE - 1) * SIDE + x)
for (let y = 0; y < SIDE; y++) stack.push(y * SIDE, y * SIDE + SIDE - 1)
while (stack.length) {
  const p = stack.pop()
  if (outside[p] || dist(p) > 60) continue
  outside[p] = 1
  const x = p % SIDE
  const y = (p - x) / SIDE
  if (x > 0) stack.push(p - 1)
  if (x < SIDE - 1) stack.push(p + 1)
  if (y > 0) stack.push(p - SIDE)
  if (y < SIDE - 1) stack.push(p + SIDE)
}

// Feather the cut using colour distance so edges stay anti-aliased.
const rgba = Buffer.alloc(SIDE * SIDE * 4)
for (let p = 0; p < SIDE * SIDE; p++) {
  rgba[p * 4] = data[p * C]
  rgba[p * 4 + 1] = data[p * C + 1]
  rgba[p * 4 + 2] = data[p * C + 2]
  const d = dist(p)
  rgba[p * 4 + 3] = !outside[p] ? 255 : d <= 12 ? 0 : d >= 45 ? 255 : Math.round(((d - 12) / 33) * 255)
}
const square = () => sharp(rgba, { raw: { width: SIDE, height: SIDE, channels: 4 } })

const opts = { compressionLevel: 9, palette: true, effort: 10 }
const png = (n) => square().resize(n, n).png(opts).toBuffer()

for (const n of [512, 192]) writeFileSync(`${OUT}/icon-${n}.png`, await png(n))

// On-page logo: the lockup with its margins trimmed off, so it can be sized by
// height in the nav and login card without a slab of empty space around it.
writeFileSync(
  `${OUT}/logo-mark.png`,
  await square()
    .extract({ left: PAD.left, top: PAD.top, width: INK.width, height: INK.height })
    .resize({ height: 320 })
    .png(opts)
    .toBuffer(),
)

// Full-bleed variants: the OS masks these, so they need an opaque square.
const bleed = async (n, scale) => {
  const inner = Math.round(n * scale)
  const pad = Math.round((n - inner) / 2)
  return sharp({ create: { width: n, height: n, channels: 4, background: '#ffffff' } })
    .composite([{ input: await square().resize(inner, inner).png().toBuffer(), top: pad, left: pad }])
    .png(opts)
    .toBuffer()
}
writeFileSync(`${OUT}/apple-touch-icon.png`, await bleed(180, 1))
writeFileSync(`${OUT}/icon-maskable-512.png`, await bleed(512, 0.72))

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
