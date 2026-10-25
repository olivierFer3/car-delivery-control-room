import { test } from 'node:test'
import assert from 'node:assert/strict'
import { liveConditions, trackFlight } from '../../lib/incidents/external'
import { createIncident, useTool, WorkflowError, type Context, type ToolsData } from '../../lib/incidents/engine'
// These tests use a fake fetch. They prove the parsing, attribution and failure handling of OUR code,
// not that any real service works; see docs/verification for the separate live check.
const now = '2026-10-25T10:00:00.000Z'
function fakeFetch(routes: Record<string, unknown | number>) {
  const calls: string[] = []
  const f = async (url: string) => {
    calls.push(url)
    const key = Object.keys(routes).find(k => url.includes(k))
    if (!key) return new Response('no route', { status: 404 })
    const v = routes[key]
    return typeof v === 'number' ? new Response('', { status: v }) : Response.json(v)
  }
  return { f: f as unknown as typeof fetch, calls }
}
const hours = Array.from({ length: 48 }, (_, n) => `2026-10-25T${String(n % 24).padStart(2, '0')}:00`.replace('2026-10-25', n < 24 ? '2026-10-25' : '2026-10-26'))
const forecast = { hourly: { time: hours, temperature_2m: hours.map(() => -2), precipitation: hours.map(() => 1), wind_gusts_10m: hours.map(() => 75), visibility: hours.map(() => 500) } }
test('weather findings are attributed, timestamped, flagged and marked as real data', async () => {
  const { f } = fakeFetch({ 'geocoding-api': { results: [{ latitude: 53.5, longitude: 10 }] }, 'api.open-meteo.com': forecast, 'autobahn.de': { warning: [], closure: [] }, 'gdeltproject': { articles: [] } })
  const r = await liveConditions([{ role: 'pickup', city: 'Hamburg', country: 'DE' }], f, now)
  assert.equal(r.dataOrigin, 'LIVE_EXTERNAL'); assert.equal(r.incidentClock, 'simulated')
  const w = r.sources.find(s => s.id === 'live:weather:Hamburg')!
  assert.equal(w.status, 'ok'); assert.equal(w.source, 'open-meteo.com'); assert.equal(w.observedAt, now)
  assert.ok(w.findings.some(x => x.severity === 'risk' && /Storm-force/.test(x.text)))
  assert.ok(w.findings.some(x => /Freezing/.test(x.text))); assert.ok(w.findings.some(x => /low visibility/.test(x.text)))
})
test('a failing source is reported unavailable and never filled in', async () => {
  const { f } = fakeFetch({ 'geocoding-api': { results: [{ latitude: 60.1, longitude: 24.9 }] }, 'api.open-meteo.com': 503, 'tie.digitraffic.fi': 500, 'rata.digitraffic.fi': 500, 'gdeltproject': 429 })
  const r = await liveConditions([{ role: 'delivery', city: 'Helsinki', country: 'FI' }], f, now)
  assert.ok(r.sources.length >= 4)
  for (const s of r.sources) { assert.equal(s.status, 'unavailable'); assert.deepEqual(s.findings, []); assert.ok(s.reason) }
})
test('German roads: only current items within 40 km are reported', async () => {
  const near = { coordinate: { lat: '53.55', long: '10.0' }, title: 'A7 Unfall', subtitle: 'Hamburg', isBlocked: 'true', future: false }
  const far = { coordinate: { lat: '48.1', long: '11.5' }, title: 'far away', future: false }
  const later = { coordinate: { lat: '53.55', long: '10.0' }, title: 'planned', future: true }
  const { f } = fakeFetch({ 'geocoding-api': { results: [{ latitude: 53.55, longitude: 10 }] }, 'api.open-meteo.com': forecast, '/services/warning': { warning: [near, far, later] }, '/services/closure': { closure: [] }, 'gdeltproject': { articles: [] } })
  const r = await liveConditions([{ role: 'pickup', city: 'Hamburg', country: 'DE' }], f, now)
  const roads = r.sources.find(s => s.id === 'live:roads:Hamburg')!
  assert.equal(roads.findings.filter(x => /A7 Unfall/.test(x.text)).length, 8) // 12 identical fake corridor answers, capped at 8
  assert.ok(roads.findings.every(x => !/far away|planned/.test(x.text)))
  assert.ok(roads.findings.every(x => x.severity === 'risk'))
})
test('flight tracking reports absence without claiming the flight is not flying', async () => {
  const { f } = fakeFetch({ 'opensky-network.org': { states: [['abc', 'DLH123  ', 'Germany', 1, 1790000000, 9.9, 53.6, 1000, false, 200]] } })
  assert.match((await trackFlight('DLH123', f, now)).sources[0].findings[0].text, /in flight/)
  const none = (await trackFlight('XYZ999', f, now)).sources[0].findings[0].text
  assert.match(none, /does not prove/)
})
const context: Context = { order: { id: 'order' }, alerts: [{ id: 'signal', status: 'OPEN' }], messages: [], reservations: [], options: [] }
test('the tool is scoped to the order, stores attributed evidence, and is not repeated', async () => {
  let n = 0
  const live = { conditions: (async (places: unknown[]) => { n++; return { dataOrigin: 'LIVE_EXTERNAL', observedAt: now, incidentClock: 'simulated', warning: 'w', places, sources: [{ id: 'live:weather:Hamburg', source: 'open-meteo.com', label: 'Weather', url: 'u', observedAt: now, status: 'ok', findings: [{ text: 'gusts', severity: 'watch' }] }, { id: 'live:news:strikes', source: 'gdeltproject.org', label: 'News', url: 'u', observedAt: now, status: 'unavailable', reason: 'HTTP 429', findings: [] }] } }) as never, flight: (async () => { throw new Error('unused') }) as never }
  const data: ToolsData = { context: async () => structuredClone(context), similar: async () => [], places: async () => [{ role: 'pickup', city: 'Hamburg', country: 'DE' }], live }
  const i = createIncident('order', 'signal', 'delay'); i.mode = 'llm'
  await assert.rejects(() => useTool(i, { tool: 'check_external_conditions', args: {} }, data), WorkflowError)
  await useTool(i, { tool: 'get_order_context', args: {} }, data)
  await assert.rejects(() => useTool(i, { tool: 'check_external_conditions', args: { city: 'Moscow' } }, data), /Unexpected tool argument/)
  await useTool(i, { tool: 'check_external_conditions', args: {} }, data)
  await useTool(i, { tool: 'check_external_conditions', args: {} }, data)
  assert.equal(n, 1)
  const ev = i.evidence.filter(e => e.id.startsWith('live:'))
  assert.equal(ev.length, 2)
  assert.ok(ev.every(e => /REAL data observed/.test(e.source) && /simulated/.test(e.source) && e.kind === 'reported'))
  assert.match(ev.find(e => e.id.startsWith('live:news'))!.text, /nothing is concluded/)
  assert.equal(i.state, 'investigating'); assert.equal(i.proposals.length, 0)
})
