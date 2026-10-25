"use client"
import { useEffect, useState } from "react"
import styles from "./incidents.module.css"
import { driverAccess } from "./actions"

/** Shows the Driver Support URL to open on a phone. */
export function DriverLink() {
  const [info, setInfo] = useState<Awaited<ReturnType<typeof driverAccess>> | null>(null)
  const [copied, setCopied] = useState(false)
  useEffect(() => { driverAccess().then(setInfo).catch(() => setInfo(null)) }, [])
  if (!info) return null
  const url = info.code ? `${window.location.origin}/driver?k=${info.code}` : null
  return <section aria-label="Driver Support link" className={styles.driverLink}>
    <p><strong>Driver Support page</strong> <span className={styles.originBadge} data-kind="simulated">driver is synthetic; calls are simulated</span></p>
    {url ? <p className={styles.driverUrl}><code>{url}</code> <button type="button" className={styles.secondary} onClick={async () => { try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* clipboard can be blocked */ } }}>{copied ? "Copied" : "Copy link"}</button></p> : <p>{info.error}</p>}
  </section>
}
