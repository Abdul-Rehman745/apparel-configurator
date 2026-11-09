import { chromium } from '@playwright/test'
import { readFile } from 'node:fs/promises'
const rows = JSON.parse(await readFile('artifacts/garment-verification/poly-search.json', 'utf8'))
const items = [...new Map(rows.flatMap(r => r.results).map(r => [r.publicID, r])).values()].filter(r => /shirt|washing|casual|hoodie|jacket|closet and clothes/i.test(r.title))
const browser = await chromium.launch()
try {
 const page = await browser.newPage({ viewport: { width: 1100, height: 1100 } })
 await page.setContent('<style>body{display:grid;grid-template-columns:repeat(4,1fr);font:14px sans-serif}img{width:240px;height:190px;object-fit:contain}figure{margin:8px}</style>')
 await page.evaluate(items => {for(const item of items){const f=document.createElement('figure');const i=document.createElement('img');i.src=item.previewUrl;const c=document.createElement('figcaption');c.textContent=item.title+' — '+item.creator.username;f.append(i,c);document.body.append(f)}},items)
 await page.waitForFunction(() => [...document.images].every(i=>i.complete),undefined,{timeout:30000})
 console.log(await page.evaluate(()=>[...document.images].map(i=>({src:i.src,loaded:i.naturalWidth>0}))))
 await page.screenshot({path:'artifacts/garment-verification/source-previews.png',fullPage:true})
} finally { await browser.close() }
