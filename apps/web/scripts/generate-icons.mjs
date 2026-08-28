import sharp from 'sharp'
import { writeFileSync } from 'node:fs'

const SRC = 'logo/logo-flo.png'
const OUT = 'public'
// icon tile bounds inside the artwork, measured pixel-by-pixel
const TILE = { left: 178, top: 219, width: 400, height: 421 }

// 1. crop the tile and square it off
const square = await sharp(SRC).extract(TILE).resize(1024, 1024, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true })
const S = 1024
const { data, info } = square
const C = info.channels

// 2. derive alpha from the artwork itself: outside the tile's rounded corners the
// source is pure black, the tile itself is never below ~380 summed brightness.
const rgba = Buffer.alloc(S * S * 4)
for (let i = 0, j = 0; i < S * S; i++, j += C) {
  const sum = data[j] + data[j + 1] + data[j + 2]
  const a = sum <= 60 ? 0 : sum >= 150 ? 255 : Math.round(((sum - 60) / 90) * 255)
  rgba[i * 4] = data[j]
  rgba[i * 4 + 1] = data[j + 1]
  rgba[i * 4 + 2] = data[j + 2]
  rgba[i * 4 + 3] = a
}
const mark = () => sharp(rgba, { raw: { width: S, height: S, channels: 4 } })

const png = (n) => mark().resize(n, n).png({ compressionLevel: 9, palette: true, effort: 10 }).toBuffer()

// transparent-corner marks
for (const n of [512, 192]) writeFileSync(`${OUT}/icon-${n}.png`, await png(n))
writeFileSync(`${OUT}/logo-mark.png`, await png(128))

// full-bleed variants: the mark sitting on the tile's own blue gradient
const bg = (n) => Buffer.from(
  `<svg width="${n}" height="${n}" xmlns="http://www.w3.org/2000/svg">
     <defs><linearGradient id="g" x1="1" y1="0" x2="0" y2="1">
       <stop offset="0" stop-color="#17bffb"/><stop offset="1" stop-color="#0067d6"/>
     </linearGradient></defs>
     <rect width="${n}" height="${n}" fill="url(#g)"/>
   </svg>`,
)
const bleed = async (n, scale) => {
  const inner = Math.round(n * scale)
  const pad = Math.round((n - inner) / 2)
  return sharp(bg(n))
    .composite([{ input: await mark().resize(inner, inner).png().toBuffer(), top: pad, left: pad }])
    .png({ compressionLevel: 9, palette: true, effort: 10 })
    .toBuffer()
}
writeFileSync(`${OUT}/apple-touch-icon.png`, await bleed(180, 0.9))
writeFileSync(`${OUT}/icon-maskable-512.png`, await bleed(512, 0.68))

// favicon.ico — 16/32/48 PNG entries in an ICO container
const sizes = [16, 32, 48]
const imgs = await Promise.all(sizes.map(png))
const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4)
let offset = 6 + 16 * sizes.length
const dir = sizes.map((n, i) => {
  const e = Buffer.alloc(16)
  e[0] = n; e[1] = n; e[2] = 0; e[3] = 0
  e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6)
  e.writeUInt32LE(imgs[i].length, 8); e.writeUInt32LE(offset, 12)
  offset += imgs[i].length
  return e
})
writeFileSync(`${OUT}/favicon.ico`, Buffer.concat([header, ...dir, ...imgs]))

console.log('done')
