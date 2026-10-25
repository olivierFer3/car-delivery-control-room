"use client"
import Link from "next/link"
import { useEffect, useState } from "react"
import { AppFrame } from "../components/app-frame"
import { SIMULATION_TIME } from "@/lib/incidents/contracts"
import { DATASETS, humanLabel, type CatalogResponse } from "@/lib/incidents/dataset-contracts"
import styles from "./incidents.module.css"
export function DatasetDashboard({ initial }: { initial: Record<string, string> }) {
  const [filters, setFilters] = useState({ dataset: initial.dataset ?? "bahn", q: initial.q ?? "", status: initial.status ?? "", domain: initial.domain ?? "", type: initial.type ?? "", severity: initial.severity ?? "", solution: initial.solution ?? "", page: initial.page ?? "1" })
  const [data, setData] = useState<CatalogResponse | null>(null), [error, setError] = useState(""), [loading, setLoading] = useState(true), [refresh, setRefresh] = useState(0)
  const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value)).toString()
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError("")
    const timer = setTimeout(() => {
      window.history.replaceState(null, "", `/incidents?${params}`)
      fetch(`/api/incident-dataset?${params}`, { signal: controller.signal, cache: "no-store" }).then(async r => { const body = await r.json(); if (!r.ok) throw new Error(body.error); setData(body) }).catch(e => { if (!controller.signal.aborted) setError(e.message ?? "Could not load dataset") }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    }, filters.q ? 180 : 0)
    return () => { clearTimeout(timer); controller.abort() }
  }, [params, refresh, filters.q])
  function filter(key: keyof typeof filters, value: string) { setFilters(f => ({ ...f, [key]: value, page: "1", ...(key === "dataset" ? { domain: "", type: "", status: "", severity: "", solution: "" } : {}) })) }
  const options = (values: string[]) => values.map(v => <option key={v} value={v}>{humanLabel(v)}</option>)
  return <AppFrame section="incidents" snapshotAt={SIMULATION_TIME}><main className={styles.page}>
    <header className={styles.header}><div><p className={styles.eyebrow}>Control room · incident library</p><h1>Incidents</h1><p>Find the case, inspect its evidence and investigate the next decision.</p></div><Link className={styles.secondary} href="/incidents?view=workspace">Decision workspace →</Link></header>
    <p><Link className={styles.primary} href="/incidents/orders">Investigate supplied orders →</Link></p>
    {data?.investigations?.length ? <section className={styles.section}><div className={styles.sectionHead}><h2>Recent investigations</h2><p>Review recommendations and follow investigations started from the dataset.</p></div><ul className={styles.cards}>{data.investigations.map(run => <li key={run.id}><Link className={styles.card} href={`/incidents/catalog/${encodeURIComponent(run.problemId)}`}><div className={styles.cardTop}><span className={styles.reference}>{run.reference ?? run.problemId} · {DATASETS[run.dataset]}</span><span className={styles.badge}>{run.decisions.at(-1) ? humanLabel(run.decisions.at(-1)!.choice) : run.state === "finished" && ["person_decides", "person_only"].includes(run.trace?.finish?.handoff ?? "") ? "Needs your decision" : humanLabel(run.state)}</span></div><h3>{run.trace?.finish?.headline ?? run.trace?.finish?.summary ?? "Agent investigation"}</h3><p>{run.error ?? run.trace?.finish?.recommendation ?? "Gathering evidence"}</p><span className={styles.open}>Open investigation →</span></Link></li>)}</ul></section> : null}
    <nav className={styles.datasetTabs} aria-label="Incident datasets">{Object.entries(DATASETS).map(([key, label]) => <button key={key} className={styles.secondary} aria-pressed={filters.dataset === key} onClick={() => filter("dataset", key)}>{label} <span className={styles.count}>{data?.counts[key as keyof typeof DATASETS] ?? "…"}</span></button>)}<button className={styles.secondary} aria-pressed={filters.dataset === "all"} onClick={() => filter("dataset", "all")}>All datasets</button></nav>
    <div className={styles.metrics}><div><strong>{data?.total ?? "—"}</strong><span>Matching incidents</span></div><div><strong>{data?.statusCounts.open ?? "—"}</strong><span>Open in selected dataset</span></div><div><strong>{data?.statusCounts.resolved ?? "—"}</strong><span>Resolved in selected dataset</span></div><div><strong>{data?.statusCounts.scenario ?? "—"}</strong><span>Test scenarios · not live incidents</span></div></div>
    <form className={styles.filters} onSubmit={e => e.preventDefault()} aria-label="Filter incidents">
      <label className={styles.searchFilter}>Search<input type="search" value={filters.q} placeholder="Order, vehicle, message or incident…" onChange={e => filter("q", e.target.value)} /></label>
      <label>Status<select value={filters.status} onChange={e => filter("status", e.target.value)}><option value="">All statuses</option>{options(["open", "resolved", "scenario"])}</select></label>
      <label>Domain<select value={filters.domain} onChange={e => filter("domain", e.target.value)}><option value="">All domains</option>{options(data?.facets.domains ?? [])}</select></label>
      <label>Problem type<select value={filters.type} onChange={e => filter("type", e.target.value)}><option value="">All types</option>{options(data?.facets.types ?? [])}</select></label>
      <label>Severity<select value={filters.severity} onChange={e => filter("severity", e.target.value)}><option value="">All severities</option>{options(["critical", "high", "medium", "low"])}</select></label>
      <label>Solution<select value={filters.solution} onChange={e => filter("solution", e.target.value)}><option value="">All solutions</option>{options(["applied", "planned", "none", "expected"])}</select></label>
    </form>
    {filters.dataset !== "bahn" && <p className={styles.notice}>Test scenarios have an expected outcome for evaluation. It is not evidence of an action performed or a permission to act.</p>}
    {error && <div className={styles.error} role="alert">{error}<button className={styles.secondary} onClick={() => setRefresh(x => x + 1)}>Retry</button></div>}
    <section aria-label="Incident results" aria-busy={loading} className={styles.section}>
      <div className={styles.sectionHead}><h2>{filters.dataset === "all" ? "All incidents and scenarios" : DATASETS[filters.dataset as keyof typeof DATASETS] ?? "Incidents"}</h2><p role="status">{loading ? "Loading incidents…" : `${data?.total ?? 0} results · page ${data?.page ?? 1} of ${data?.pages ?? 1}`}</p></div>
      {!loading && !error && data?.items.length === 0 && <div className={styles.empty}>No incidents match these filters. <button className={styles.secondary} onClick={() => setFilters(f => ({ ...f, q: "", status: "", domain: "", type: "", severity: "", solution: "", page: "1" }))}>Clear filters</button></div>}
      <ul className={styles.cards}>{data?.items.map(p => <li key={p.id}><Link className={styles.card} href={`/incidents/catalog/${encodeURIComponent(p.id)}`}>
        <div className={styles.cardTop}><span className={styles.reference}>{p.order?.reference ?? "Order not linked"}</span><span className={styles.badge}>{humanLabel(p.status)}</span></div>
        <div className={styles.tags}><span>{humanLabel(p.domain)}</span>{p.severity && <span data-severity={p.severity}>{humanLabel(p.severity)}</span>}</div>
        <h3>{humanLabel(p.problem_type)}</h3><p>{p.summary ?? "No summary supplied"}</p>{p.order?.vehicle && <p>{p.order.vehicle}</p>}
        {p.nextStep && <p><strong>Next:</strong> {p.nextStep}</p>}<p>{p.waiting_on.length ? `Waiting on ${p.waiting_on.join(", ")}` : p.owners.length ? `Owner: ${p.owners.join(", ")}` : "Owner not supplied"}</p>
        <div className={styles.cardTop}><span className={styles.source}>{humanLabel(p.solutionStatus)} solution · {p.decisionCount} recorded decisions</span><span className={styles.open}>Open incident →</span></div>
      </Link></li>)}</ul>
      {data && data.pages > 1 && <nav className={styles.pagination} aria-label="Results pages"><button className={styles.secondary} disabled={loading || data.page <= 1} onClick={() => setFilters(f => ({ ...f, page: String(data.page - 1) }))}>← Previous</button><span>Page {data.page} / {data.pages}</span><button className={styles.secondary} disabled={loading || data.page >= data.pages} onClick={() => setFilters(f => ({ ...f, page: String(data.page + 1) }))}>Next →</button></nav>}
    </section><p className={styles.footnote}>An open incident is a signal to investigate. A resolved incident does not prove delivery. Existing demo decisions are preserved in the decision workspace.</p>
  </main></AppFrame>
}
