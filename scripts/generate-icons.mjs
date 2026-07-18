// Generates PWA icons using the Twemoji 📚 emoji on a blue background.
// Run once: node scripts/generate-icons.mjs
import { createWriteStream, mkdirSync } from 'fs'
import { writeFile } from 'fs/promises'
import https from 'https'
import sharp from 'sharp'

// Tailwind blue-600 background — matches the app's primary colour
const BG = '#2563EB'

// Twemoji CDN — 📚 = U+1F4DA
const TWEMOJI_URL = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f4da.svg'

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} from ${url}`))
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      res.on('error', reject)
    }).on('error', reject)
  })
}

async function buildComposite(size, emojiSvg) {
  // We embed the emoji SVG as an <image> inside a wrapper SVG with the blue
  // background rect, then let sharp rasterise the whole thing in one pass.
  // The emoji is padded to ~70% of the icon size.
  const pad = Math.round(size * 0.15)  // 15% padding on each side
  const inner = size - pad * 2

  // Encode the raw emoji SVG as a data-URI so we can reference it inline.
  const dataUri = `data:image/svg+xml;base64,${Buffer.from(emojiSvg).toString('base64')}`

  const wrapper = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" fill="${BG}" rx="${Math.round(size * 0.18)}"/>
  <image href="${dataUri}" x="${pad}" y="${pad}" width="${inner}" height="${inner}"/>
</svg>`

  return sharp(Buffer.from(wrapper)).png().toBuffer()
}

async function main() {
  console.log('⏳ Fetching Twemoji 📚 SVG…')
  const emojiSvg = await fetchText(TWEMOJI_URL)
  console.log('✅ SVG fetched')

  mkdirSync('public', { recursive: true })

  const sizes = [
    { file: 'public/icon-192.png',         size: 192 },
    { file: 'public/icon-512.png',         size: 512 },
    { file: 'public/apple-touch-icon.png', size: 180 },
  ]

  for (const { file, size } of sizes) {
    const buf = await buildComposite(size, emojiSvg)
    await writeFile(file, buf)
    console.log(`✅ ${file} (${size}×${size})`)
  }

  console.log('\n🎉 PWA icons generated with the 📚 emoji!')
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
