// Local-only admin workflow. Provision a temporary operator, publish through the UI, then remove it.
import { chromium, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'

const status = JSON.parse((await readFile('.supabase-status.local', 'utf8')).replace(/^\uFEFF/, ''))
const url = status.API_URL
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname), 'Only local development is supported')
const db = createClient(url, status.SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const email = `model-qa-${randomUUID()}@example.test`, password = randomUUID() + randomUUID()
const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true })
if (error) throw error
const userId = data.user.id
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
let page
try {
  const membership = await db.from('tenant_admins').insert({ tenant_id: 'default', user_id: userId })
  if (membership.error) throw membership.error
  await mkdir('artifacts/glb-qa', { recursive: true })
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.on('requestfailed', r => console.log('Request failed:', new URL(r.url()).origin + new URL(r.url()).pathname, r.failure()?.errorText))
  await page.goto('http://localhost:5190/admin')
  await page.getByRole('textbox', { name: 'Admin email' }).fill(email)
  await page.getByRole('textbox', { name: 'Admin password' }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByText('admin of this store', { exact: false })).toBeVisible()
  await page.locator('input[type=file][accept=".glb,model/gltf-binary"]').setInputFiles('models/hanging-prepared/tshirt-panels.glb')
  await expect(page.getByLabel('Label', { exact: true }).last()).toHaveValue('tshirt-panels', { timeout: 60000 })
  await page.getByRole('button', { name: 'Import / export', exact: true }).click()
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export catalog.json', exact: true }).click()
  const download = await downloadEvent
  const catalog = JSON.parse(await readFile(await download.path(), 'utf8'))
  await writeFile('artifacts/glb-qa/catalog-before-mapping.json', JSON.stringify(catalog, null, 2))
  const product = catalog.products.find(p => p.id === 'tshirt')
  const uploaded = product.models.at(-1)
  assert.equal(uploaded.source.type, 'glb')
  const measurements = JSON.parse(await readFile('models/hanging-prepared/panel_measurements.json', 'utf8'))
  const existing = product.models.find(m => m.id === 'real-tee')
  assert(existing, 'Expected the current Real Tee catalog definition')
  const model = {
    ...existing, source: uploaded.source,
    panels: Object.entries(measurements.panels).map(([id, p]) => ({ id, label: id.replaceAll('_', ' '), mesh: p.mesh, widthIn: p.widthIn, heightIn: p.heightIn, colorZone: 'body' })),
    printAreas: existing.printAreas.map(a => a.group === 'sleeve' ? { ...a, rect: { xIn: measurements.panels[a.panel].widthIn / 2 - 1.5, yIn: 3, wIn: 3, hIn: 2 } } : a),
    license: existing.license
  }
  product.models = product.models.slice(0, -1).filter(m => m.id !== 'hanging-tee').map(m => m.id === model.id ? model : m)
  await writeFile('artifacts/glb-qa/catalog.json', JSON.stringify(catalog, null, 2))
  await page.locator('input[type=file][accept="application/json,.json"]').setInputFiles('artifacts/glb-qa/catalog.json')
  await page.getByRole('button', { name: 'Publish changes', exact: true }).click()
  await expect(page.getByText('All changes saved', { exact: true })).toBeVisible({ timeout: 30000 })
  console.log('Published real-tee through authenticated /admin; duplicate hanging-tee removed')
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  for (const side of ['full_front', 'full_back', 'left_sleeve', 'right_sleeve']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const qa = await context.newPage()
    const errors = []
    qa.on('pageerror', e => errors.push(e.message))
    await qa.goto(`http://localhost:5190/?product=tshirt&model=real-tee&checker=${side}`)
    await qa.waitForFunction(side => {
      const app = window.__configurator
      let meshes = 0
      app?.viewer()?.debug?.().scene.traverse(o => { if (o.isMesh && o.userData.panelId && !o.userData.overlay) meshes++ })
      return meshes === 4 && app.store.getState().design.modelId === 'real-tee' && app.store.getState().design.areas[side]?.objects?.length > 0
    }, side, { timeout: 60000 })
    await qa.waitForTimeout(3500)
    await qa.screenshot({ path: `artifacts/glb-qa/checker-${side}.png` })
    assert.deepEqual(errors, [])
    console.log(`Fresh browser ${side} checker loaded with stored GLB and artwork`)
    await context.close()
  }
} catch (e) {
  if (page) await page.screenshot({ path: 'artifacts/glb-qa/admin-error.png', fullPage: true }).catch(() => {})
  throw e
} finally {
  await db.from('tenant_admins').delete().eq('user_id', userId)
  await db.auth.admin.deleteUser(userId)
  await browser.close()
}
