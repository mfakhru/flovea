import sharp from 'sharp'
import { writeFileSync } from 'node:fs'

const SRC = 'logo/logo.png'
const OUT = 'public'
// The full lockup — "flo", the wallet mark, and the tagline. Bounds are the
// artwork's ink, measured off the source; the file itself carries wide margins.
// The source is already transparent outside the lockup, so the ink is just
// everything with a non-zero alpha.
const INK = { left: 466, top: 669, width: 1113, height: 710 }
const SIDE = 1200 // square working canvas, ~3.7% margin around the lockup
const PAD = { left: Math.round((SIDE - INK.width) / 2), top: Math.round((SIDE - INK.height) / 2) }

// Centre the lockup on a transparent square. Nothing is recoloured or
// rescaled non-uniformly, so the artwork keeps its own aspect ratio. Rendered
// once up front: sharp applies extend *after* resize within a single pipeline,
// so the square has to be materialised before anything downstream resizes it.
const squareBuf = await sharp(SRC)
  .ensureAlpha()
  .extract(INK)
  .extend({
    left: PAD.left,
    right: SIDE - INK.width - PAD.left,
    top: PAD.top,
    bottom: SIDE - INK.height - PAD.top,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .png()
  .toBuffer()
const square = () => sharp(squareBuf)

const opts = { compressionLevel: 9, palette: true, effort: 10 }
const png = (n) => square().resize(n, n).png(opts).toBuffer()

for (const n of [512, 192]) writeFileSync(`${OUT}/icon-${n}.png`, await png(n))

// On-page logo: the lockup with its margins trimmed off, so it can be sized by
// height in the nav and login card without a slab of empty space around it.
writeFileSync(
  `${OUT}/logo-mark.png`,
  await sharp(SRC).ensureAlpha().extract(INK).resize({ height: 320 }).png(opts).toBuffer(),
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
