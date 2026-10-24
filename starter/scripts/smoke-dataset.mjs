import 'dotenv/config'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const base = process.env.APP_URL ?? 'http://127.0.0.1:3001'
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errors = []; page.on('pageerror', e => errors.push(e.message))
const get = async url => { const r = await fetch(base + url); assert.equal(r.status, 200, url); return r.json() }
try {
  const before = await get('/api/incidents')
  const all = await get('/api/incident-dataset?dataset=all')
  assert.equal(all.total, 3977); assert.equal(all.items.length, 30)
  const synthetic = await get('/api/incident-dataset?dataset=synthetic&page=129')
  assert.equal(synthetic.items.length, 10)
  await page.goto(base + '/incidents')
  await page.getByText('74 results · page 1 of 3', { exact: true }).waitFor()
  await page.getByLabel('Search', { exact: true }).fill('Bentley')
  await page.waitForFunction(() => !document.querySelector('[aria-label="Incident results"]').getAttribute('aria-busy').includes('true'))
  assert.ok(await page.locator('a[href^="/incidents/catalog/"]').count())
  await page.getByRole('button', { name: 'Hand-written tests' }).click()
  await page.getByLabel('Search', { exact: true }).fill('')
  await page.getByText('31 results · page 1 of 2', { exact: true }).waitFor()
  await page.goto(base + '/incidents/catalog/test-0010')
  await page.getByRole('heading', { name: 'Offer not taken', exact: true }).waitFor()
  await page.getByText('Reveal expected outcome · not evidence', { exact: true }).waitFor()
  assert.equal(await page.getByRole('link', { name: 'Open source order' }).count(), 0)
  const artifacts = path.resolve('../docs/verification'); await mkdir(artifacts, { recursive: true })
  await page.screenshot({ path: path.join(artifacts, 'dataset-scenario.png'), fullPage: true })
  if (process.env.DATASET_LIVE_AGENT === '1' && (await get('/api/incident-dataset/test-0010')).agentConfigured) {
    assert.ok(process.env.INCIDENT_OPERATOR_TOKEN)
    await page.getByLabel('Operator token', { exact: false }).fill(process.env.INCIDENT_OPERATOR_TOKEN)
    await page.getByRole('button', { name: 'Unlock decisions' }).click()
    await page.getByText('Operator access unlocked.').waitFor()
    const first = await get('/api/incident-dataset/test-0010')
    await page.getByRole('button', { name: first.runs.length ? 'Start a new investigation' : 'Investigate this incident', exact: true }).click()
    console.log('Live selected-case investigation started; no reference answer or external action is sent.')
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent === 'Start a new investigation' && !b.disabled), { timeout: 140000 })
    const final = await get('/api/incident-dataset/test-0010')
    assert.equal(final.runs.length, first.runs.length + 1)
    console.log(JSON.stringify({ runState: final.runs[0].state, handoff: final.runs[0].trace?.finish?.handoff, steps: final.runs[0].trace?.steps.length, blockedActions: final.runs[0].trace?.violations.length, decisions: final.runs[0].decisions.length }))
    await page.screenshot({ path: path.join(artifacts, 'dataset-investigation.png'), fullPage: true })
  }
  if (!(await get('/api/incident-dataset/test-0010')).agentConfigured) {
    await page.getByText('Agent connection required', { exact: true }).waitFor(); assert.equal(await page.getByRole('button', { name: /Investigate this incident|Start a new investigation/ }).isDisabled(), true); console.log('Verified unconfigured-agent state; no further live model call attempted.')
  }
  await page.goto(base + '/incidents/catalog/bahn-21a8e9a0b5ec')
  await page.getByRole('heading', { name: 'Vehicle warning', exact: true }).waitFor()
  assert.equal(await page.getByRole('link', { name: 'Open source order' }).count(), 1)
  await page.setViewportSize({ width: 390, height: 844 })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Detail mobile overflow')
  await page.screenshot({ path: path.join(artifacts, 'dataset-mobile.png'), fullPage: true })
  await page.goto(base + '/incidents')
  await page.getByText('74 results · page 1 of 3', { exact: true }).waitFor()
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Dashboard mobile overflow')
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.screenshot({ path: path.join(artifacts, 'dataset-dashboard.png'), fullPage: false })
  const after = await get('/api/incidents'); assert.deepEqual(after, before, 'Existing incident histories preserved')
  assert.deepEqual(errors, [])
  console.log('PASS: dataset counts, pagination, filters, scenario/source distinction, detail, source-order link, mobile layout, no browser errors, existing histories unchanged.')
} finally { await browser.close() }
