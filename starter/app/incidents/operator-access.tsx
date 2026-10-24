"use client"
import { useEffect, useState } from "react"
import styles from "./incidents.module.css"
import { lockOperator, operatorAccess, unlockOperator } from "./actions"

export function OperatorAccess() {
  const [ready, setReady] = useState<boolean | null>(null)
  const [token, setToken] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  useEffect(() => { operatorAccess().then(setReady).catch(() => setError("Could not check operator access.")) }, [])
  return <section aria-label="Operator access" className={styles.access}>
    {ready === null ? <p role="status">Checking operator access…</p> : ready ? <p>Operator access unlocked. <button className={styles.secondary} type="button" disabled={busy} onClick={async () => {
      setBusy(true)
      try { await lockOperator(); setReady(false) } catch { setError("Could not lock operator access.") } finally { setBusy(false) }
    }}>Lock access</button></p> : <form onSubmit={async event => {
      event.preventDefault(); setBusy(true); setError("")
      try { const result = await unlockOperator(token); setToken(""); if (result.error) setError(result.error); else setReady(true) }
      catch { setError("Could not unlock access. Please retry.") } finally { setBusy(false) }
    }} className={styles.accessForm}>
      <label htmlFor="operator-token">Operator token </label>
      <input id="operator-token" type="password" autoComplete="current-password" required value={token} onChange={event => setToken(event.target.value)} className={styles.accessInput} />
      <button className={styles.secondary} type="submit" disabled={busy}>{busy ? "Unlocking…" : "Unlock decisions"}</button>
    </form>}
    {error && <p role="alert">{error}</p>}
  </section>
}
