// Local dev only: merge the corrected real-tee GLB model into the tenant's stored catalog
// (replacing the earlier hanging-tee upload whose sleeve split was wrong), keeping other admin edits.
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import { defaultCatalog } from '../supabase/functions/_shared/domain.js'

const status = JSON.parse((await readFile('.supabase-status.local', 'utf8')).replace(/^﻿/, ''))
assert(['localhost', '127.0.0.1'].includes(new URL(status.API_URL).hostname), 'Local development only')
const db = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const realTee = defaultCatalog.products.find((p) => p.id === 'tshirt').models.find((m) => m.id === 'real-tee')
const { data: row } = await db.from('catalogs').select('catalog').eq('tenant_id', 'default').maybeSingle()
const catalog = row?.catalog ?? defaultCatalog
const tshirt = catalog.products.find((p) => p.id === 'tshirt')
tshirt.models = [realTee, ...tshirt.models.filter((m) => !['real-tee', 'hanging-tee'].includes(m.id))]
const { error } = await db.from('catalogs').upsert({ tenant_id: 'default', catalog })
if (error) throw error
console.log('t-shirt models now:', tshirt.models.map((m) => `${m.id}:${m.source.type}`).join(', '))
