import sharp from 'sharp'

const sizes = [
  { size: 108, file: 'alexa-icon-small.png' },
  { size: 512, file: 'alexa-icon-large.png' },
]

function makeSvg(size) {
  const s = size
  const cx = s / 2
  const roofTop = s * 0.14
  const roofBase = s * 0.43
  const bodyTop = roofBase
  const bodyH = s * 0.40
  const bodyLeft = s * 0.20
  const bodyRight = s * 0.80
  const doorW = s * 0.25
  const doorH = s * 0.27
  const doorX = cx - doorW / 2
  const doorY = bodyTop + bodyH - doorH
  const starSize = s * 0.16
  const starX = s * 0.80
  const starY = s * 0.28
  const dollarSize = Math.round(doorH * 0.72)
  const dollarY = Math.round(doorY + doorH * 0.78)
  const radius = Math.round(s * 0.18)

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}">
  <defs>
    <clipPath id="clip">
      <rect x="0" y="0" width="${s}" height="${s}" rx="${radius}"/>
    </clipPath>
  </defs>
  <rect x="0" y="0" width="${s}" height="${s}" fill="#14532d" rx="${radius}"/>
  <g clip-path="url(#clip)">
    <polygon points="${cx},${roofTop} ${bodyLeft - s*0.02},${roofBase} ${bodyRight + s*0.02},${roofBase}" fill="#22c55e"/>
    <rect x="${bodyLeft}" y="${bodyTop}" width="${bodyRight - bodyLeft}" height="${bodyH}" fill="#22c55e"/>
    <rect x="${doorX}" y="${doorY}" width="${doorW}" height="${doorH}" fill="#14532d" rx="${Math.round(s*0.02)}"/>
    <text x="${cx}" y="${dollarY}" font-size="${dollarSize}" font-weight="800" fill="#4ade80" text-anchor="middle" font-family="Arial,sans-serif">$</text>
    <text x="${starX}" y="${starY}" font-size="${starSize}" fill="#fbbf24" text-anchor="middle" font-family="Arial,sans-serif">&#9733;</text>
  </g>
</svg>`
}

for (const { size, file } of sizes) {
  const svg = Buffer.from(makeSvg(size))
  await sharp(svg).png().toFile(file)
  console.log(`✅ ${file} (${size}×${size}) generated`)
}
