import { chromium } from '@playwright/test'
import { readFile, readdir } from 'node:fs/promises'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
const files = (await readdir('public/assets/icons')).filter(file => file.endsWith('.png'))
for (const file of files) {
  const data = (await readFile(`public/assets/icons/${file}`)).toString('base64')
  await page.setContent(`<canvas></canvas><img src="data:image/png;base64,${data}">`)
  const [alpha, width, height, ink] = await page.evaluate(async () => {
    const image = document.querySelector('img')
    await image.decode()
    const canvas = document.querySelector('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const context = canvas.getContext('2d')
    context.drawImage(image, 0, 0)
    const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data
    let ink = 0
    for (let i = 3; i < rgba.length; i += 4) ink += rgba[i]
    return [rgba[3], image.naturalWidth, image.naturalHeight, ink]
  })
  if (alpha !== 0) throw new Error(`${file} has an opaque corner`)
  if (width !== height || ink === 0) throw new Error(`${file} is empty or not square`)
}
await browser.close()
console.log(`${files.length} PNG assets checked: transparent corners, visible artwork, square dimensions.`)
