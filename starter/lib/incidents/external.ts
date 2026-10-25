/**
 * Live external context for incident investigations.
 *
 * Everything here is REAL data from free public APIs (no key, no cost), observed at
 * the real wall-clock time of the call. The dataset and incident clock are
 * simulated (2026-10-21), so these results describe conditions around the real
 * cities of the order *now*. They are context for the agent and the operator,
 * never proof that a booked ferry or a driver is late, and they never feed the
 * deterministic cutoff checks. Every source reports "ok" or "unavailable"; a
 * failed source is never filled in.
 */
export type Place = { role: "pickup" | "delivery"; city: string; country: string }
export type Finding = { text: string; severity: "info" | "watch" | "risk" }
export type SourceResult = {
  id: string; source: string; label: string; url: string; place?: string; observedAt: string
  status: "ok" | "unavailable"; reason?: string; findings: Finding[]
}
export type LiveConditions = {
  dataOrigin: "LIVE_EXTERNAL"; observedAt: string; incidentClock: "simulated"
  warning: string; places: Place[]; sources: SourceResult[]
}
type Fetch = (url: string, init?: RequestInit) => Promise<Response>
const WARNING = "Real data observed now from public sources. The incident clock and dataset are simulated, so this is context about the real cities involved, not evidence about the simulated booking. Do not use it to override the deterministic cutoff check or driver evidence."
const UA = { "User-Agent": "BahnControlRoom-hackathon/6 (synthetic demo)", Accept: "application/json" }
const FI_STATIONS: Record<string, string> = { Helsinki: "HKI", Espoo: "EPO", Tampere: "TPE", Turku: "TKU", Oulu: "OLK", Pori: "PRI", Lahti: "LH", Kuopio: "KUO", Jyväskylä: "JY", Vantaa: "TKL" }
const DE_CORRIDORS = ["A1", "A2", "A3", "A5", "A7", "A9", "A19", "A20", "A24", "A27", "A45", "A61"]

function km(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(h))
}
async function getJson(f: Fetch, url: string, timeoutMs = 8000): Promise<unknown> {
  const response = await f(url, { headers: UA, signal: AbortSignal.timeout(timeoutMs) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}
function result(base: Omit<SourceResult, "observedAt" | "status" | "findings">, observedAt: string, findings: Finding[]): SourceResult {
  return { ...base, observedAt, status: "ok", findings }
}
function failed(base: Omit<SourceResult, "observedAt" | "status" | "findings">, observedAt: string, error: unknown): SourceResult {
  return { ...base, observedAt, status: "unavailable", reason: error instanceof Error ? error.message : "request failed", findings: [] }
}
export async function geocode(f: Fetch, p: Place) {
  const body = await getJson(f, `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(p.city)}&count=1&countryCode=${encodeURIComponent(p.country)}&language=en&format=json`) as { results?: { latitude: number; longitude: number }[] }
  const hit = body.results?.[0]
  if (!hit) throw new Error(`No coordinates found for ${p.city}, ${p.country}`)
  return { lat: hit.latitude, lon: hit.longitude }
}
export async function weather(f: Fetch, p: Place, at: { lat: number; lon: number }, now: string): Promise<SourceResult> {
  const base = { id: `live:weather:${p.city}`, source: "open-meteo.com", label: `Weather forecast, next 24 h · ${p.city}`, url: "https://open-meteo.com/", place: `${p.city}, ${p.country}` }
  try {
    const body = await getJson(f, `https://api.open-meteo.com/v1/forecast?latitude=${at.lat}&longitude=${at.lon}&hourly=temperature_2m,precipitation,wind_gusts_10m,visibility&forecast_days=2&timezone=UTC`) as { hourly: { time: string[]; temperature_2m: number[]; precipitation: number[]; wind_gusts_10m: number[]; visibility: (number | null)[] } }
    const h = body.hourly, start = Math.max(0, h.time.findIndex(t => Date.parse(`${t}:00Z`) >= Date.parse(now) - 3600_000)), end = start + 24
    const slice = <T,>(a: T[]) => a.slice(start, end)
    const gust = Math.max(...slice(h.wind_gusts_10m)), rain = slice(h.precipitation).reduce((s, x) => s + x, 0)
    const cold = Math.min(...slice(h.temperature_2m)), vis = Math.min(...slice(h.visibility).filter((x): x is number => x != null))
    const out: Finding[] = [{ text: `Max gusts ${gust.toFixed(0)} km/h, rain ${rain.toFixed(1)} mm, lowest temperature ${cold.toFixed(0)} °C${Number.isFinite(vis) ? `, lowest visibility ${(vis / 1000).toFixed(1)} km` : ""}`, severity: "info" }]
    if (gust >= 70) out.push({ text: `Storm-force gusts (${gust.toFixed(0)} km/h) can stop ferries and bridges`, severity: "risk" })
    else if (gust >= 55) out.push({ text: `Strong gusts (${gust.toFixed(0)} km/h) may delay ferries or high-sided loads`, severity: "watch" })
    if (rain >= 20) out.push({ text: `Heavy rain expected (${rain.toFixed(0)} mm in 24 h)`, severity: "watch" })
    if (cold <= 0) out.push({ text: "Freezing temperatures: ice possible on roads", severity: "watch" })
    if (Number.isFinite(vis) && vis < 1000) out.push({ text: "Fog or very low visibility expected", severity: "watch" })
    return result(base, now, out)
  } catch (e) { return failed(base, now, e) }
}
export async function germanRoads(f: Fetch, p: Place, at: { lat: number; lon: number }, now: string): Promise<SourceResult> {
  const base = { id: `live:roads:${p.city}`, source: "autobahn.de", label: `Autobahn warnings and closures within 40 km · ${p.city}`, url: "https://autobahn.de/", place: `${p.city}, ${p.country}` }
  try {
    const found: Finding[] = []; let reachable = 0
    await Promise.all(DE_CORRIDORS.flatMap(road => ["warning", "closure"].map(async kind => {
      try {
        const body = await getJson(f, `https://verkehr.autobahn.de/o/autobahn/${road}/services/${kind}`) as Record<string, { future?: boolean; isBlocked?: string; title?: string; subtitle?: string; coordinate?: { lat: string; long: string } }[]>
        reachable++
        for (const x of body[kind] ?? []) {
          if (x.future || !x.coordinate) continue
          const d = km(at, { lat: Number(x.coordinate.lat), lon: Number(x.coordinate.long) })
          if (d <= 40) found.push({ text: `${road} ${kind === "closure" ? "closure" : "warning"} ${d.toFixed(0)} km away: ${[x.title, x.subtitle].filter(Boolean).join(" · ")}${x.isBlocked === "true" ? " (blocked)" : ""}`, severity: x.isBlocked === "true" ? "risk" : "watch" })
        }
      } catch { /* a single corridor failing is reported through reachability below */ }
    })))
    if (reachable === 0) throw new Error("Autobahn service unreachable")
    return result({ ...base, label: `${base.label} (${DE_CORRIDORS.length} main corridors only)` }, now, found.slice(0, 8).concat(found.length === 0 ? [{ text: "No current warnings or closures near this city on the main corridors checked", severity: "info" }] : []))
  } catch (e) { return failed(base, now, e) }
}
type Geo = { type: string; coordinates: unknown }
function points(g: Geo | undefined): [number, number][] {
  const out: [number, number][] = []
  const walk = (c: unknown) => { if (Array.isArray(c) && typeof c[0] === "number") out.push([c[0] as number, c[1] as number]); else if (Array.isArray(c)) c.forEach(walk) }
  walk(g?.coordinates); return out
}
export async function finnishRoads(f: Fetch, p: Place, at: { lat: number; lon: number }, now: string): Promise<SourceResult> {
  const base = { id: `live:roads:${p.city}`, source: "digitraffic.fi (Fintraffic)", label: `Road traffic announcements within 40 km · ${p.city}`, url: "https://www.digitraffic.fi/en/road-traffic/", place: `${p.city}, ${p.country}` }
  try {
    const body = await getJson(f, "https://tie.digitraffic.fi/api/traffic-message/v1/messages?inactiveHours=0&includeAreaGeometry=false&situationType=TRAFFIC_ANNOUNCEMENT") as { features: { geometry?: Geo; properties: { announcements?: { title?: string; location?: { description?: string }; timeAndDuration?: { startTime?: string } }[] } }[] }
    const found: Finding[] = []
    for (const feat of body.features ?? []) {
      const near = points(feat.geometry).some(([lon, lat]) => km(at, { lat, lon }) <= 40)
      const a = feat.properties.announcements?.[0]
      if (near && a?.title) found.push({ text: `${a.title}${a.location?.description ? ` · ${a.location.description}` : ""}`, severity: /closed|accident|onnettomuus|suljettu/i.test(a.title) ? "risk" : "watch" })
    }
    return result(base, now, found.slice(0, 8).concat(found.length === 0 ? [{ text: "No current traffic announcements near this city", severity: "info" }] : []))
  } catch (e) { return failed(base, now, e) }
}
export async function finnishTrains(f: Fetch, p: Place, now: string): Promise<SourceResult | null> {
  const code = FI_STATIONS[p.city]; if (!code) return null
  const base = { id: `live:trains:${p.city}`, source: "rata.digitraffic.fi (Fintraffic)", label: `Next passenger departures · ${p.city} station`, url: "https://www.digitraffic.fi/en/railway-traffic/", place: `${p.city}, ${p.country}` }
  try {
    const trains = await getJson(f, `https://rata.digitraffic.fi/api/v1/live-trains/station/${code}?arrived_trains=0&arriving_trains=0&departed_trains=0&departing_trains=20&include_nonstopping=false`) as { trainType: string; trainNumber: number; cancelled: boolean; trainCategory: string; timeTableRows: { stationShortCode: string; type: string; commercialStop?: boolean; differenceInMinutes?: number; cancelled?: boolean }[] }[]
    const rows = trains.filter(t => /passenger|long-distance|commuter/i.test(t.trainCategory)).map(t => ({ t, row: t.timeTableRows.find(r => r.stationShortCode === code && r.type === "DEPARTURE") })).filter(x => x.row)
    const out: Finding[] = []
    for (const { t, row } of rows) {
      if (t.cancelled || row?.cancelled) out.push({ text: `${t.trainType} ${t.trainNumber} cancelled`, severity: "risk" })
      else if ((row?.differenceInMinutes ?? 0) >= 15) out.push({ text: `${t.trainType} ${t.trainNumber} running ${row!.differenceInMinutes} min late`, severity: "watch" })
    }
    return result(base, now, out.slice(0, 8).concat(out.length === 0 ? [{ text: `${rows.length} upcoming passenger departures, none cancelled or 15+ min late`, severity: "info" }] : []))
  } catch (e) { return failed(base, now, e) }
}
export async function disruptionNews(f: Fetch, places: Place[], now: string): Promise<SourceResult> {
  const cities = [...new Set(places.map(p => p.city))]
  const base = { id: "live:news:strikes", source: "gdeltproject.org", label: `Recent news mentioning strikes or demonstrations · ${cities.join(", ")}`, url: "https://www.gdeltproject.org/", place: cities.join(", ") }
  try {
    const query = `(${cities.map(c => `"${c}"`).join(" OR ")}) (strike OR protest OR demonstration OR blockade)`
    const body = await getJson(f, `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=artlist&maxrecords=5&format=json&timespan=2d&sort=datedesc`, 10_000) as { articles?: { title: string; domain: string; seendate: string }[] }
    const items: Finding[] = (body.articles ?? []).map(a => ({ text: `"${a.title}" (${a.domain}, ${a.seendate})`, severity: "watch" }))
    return result(base, now, items.concat(items.length === 0 ? [{ text: "No matching news in the last 2 days", severity: "info" }] : [{ text: "Headlines are unverified news matches, not confirmed disruptions", severity: "info" }]))
  } catch (e) { return failed(base, now, e) }
}
export async function liveConditions(places: Place[], f: Fetch = fetch, now = new Date().toISOString()): Promise<LiveConditions> {
  const unique = places.filter((p, n) => places.findIndex(q => q.city === p.city && q.country === p.country) === n)
  const newsTask = disruptionNews(f, unique, now)
  const perPlace = await Promise.all(unique.map(async (p): Promise<SourceResult[]> => {
    let at: { lat: number; lon: number }
    try { at = await geocode(f, p) } catch (e) { return [failed({ id: `live:geocode:${p.city}`, source: "open-meteo.com", label: `Location lookup · ${p.city}`, url: "https://open-meteo.com/en/docs/geocoding-api", place: `${p.city}, ${p.country}` }, now, e)] }
    const tasks: Promise<SourceResult | null>[] = [weather(f, p, at, now)]
    if (p.country === "DE") tasks.push(germanRoads(f, p, at, now))
    if (p.country === "FI") tasks.push(finnishRoads(f, p, at, now), finnishTrains(f, p, now))
    return (await Promise.all(tasks)).filter((x): x is SourceResult => x !== null)
  }))
  const news = await newsTask
  return { dataOrigin: "LIVE_EXTERNAL", observedAt: now, incidentClock: "simulated", warning: WARNING, places: unique, sources: [...perPlace.flat(), news] }
}
/** Real ADS-B position for one callsign from the OpenSky Network (anonymous, rate limited). */
export async function trackFlight(callsign: string, f: Fetch = fetch, now = new Date().toISOString()) {
  const base = { id: `live:flight:${callsign}`, source: "opensky-network.org", label: `Live aircraft position · ${callsign}`, url: "https://opensky-network.org/" }
  try {
    const body = await getJson(f, "https://opensky-network.org/api/states/all") as { states?: (string | number | boolean | null)[][] }
    const hit = body.states?.find(s => String(s[1] ?? "").trim().toUpperCase() === callsign)
    const out: Finding[] = hit
      ? [{ text: `${callsign} is airborne/reporting: ${hit[5]}, ${hit[6]} at ${hit[7] ?? "?"} m, ${hit[8] ? "on ground" : "in flight"}, ${hit[9] ?? "?"} m/s, last contact ${new Date(Number(hit[4]) * 1000).toISOString()}`, severity: "info" }]
      : [{ text: `${callsign} is not in the current ADS-B feed. That does not prove it is not flying (coverage gaps, flight not yet departed or already landed)`, severity: "info" }]
    return { dataOrigin: "LIVE_EXTERNAL" as const, observedAt: now, incidentClock: "simulated" as const, warning: WARNING, sources: [result(base, now, out)] }
  } catch (e) { return { dataOrigin: "LIVE_EXTERNAL" as const, observedAt: now, incidentClock: "simulated" as const, warning: WARNING, sources: [failed(base, now, e)] } }
}
