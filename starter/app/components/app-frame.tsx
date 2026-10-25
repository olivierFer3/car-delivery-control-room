import Link from "next/link"
import type { ReactNode } from "react"
import { BahnLogo } from "./bahn-logo"
import { fmtDateTime } from "@/lib/present/time"

export type Section = "board" | "incidents" | "inbox" | "customers" | "drivers" | "sites"

const GROUPS: { label: string; links: { section: Section; href: string; label: string; icon: string }[] }[] = [
  { label: "Work", links: [
    { section: "incidents", href: "/incidents", label: "Incidents", icon: "alert" },
    { section: "board", href: "/", label: "Orders", icon: "car" },
    { section: "inbox", href: "/inbox", label: "Inbox", icon: "inbox" },
  ] },
  { label: "People and places", links: [
    { section: "customers", href: "/customers", label: "Customers", icon: "people" },
    { section: "drivers", href: "/drivers", label: "Drivers", icon: "driver" },
    { section: "sites", href: "/sites", label: "Places", icon: "building" },
  ] },
]

export function AppFrame({ children, section, snapshotAt, board = false }: { children: ReactNode; section: Section; snapshotAt?: string | null; board?: boolean }) {
  return <div className={`app${board ? " app-board" : ""}`}>
    <header className="topbar">
      <Link href="/" className="wordmark" aria-label="Bahn Control Room home"><BahnLogo className="wordmark-logo" /><span className="wordmark-sub">control room</span></Link>
      <nav className="topnav" aria-label="Main navigation">
        {GROUPS.flatMap((group) => group.links).map((link) => <Link key={link.section} href={link.href} className={`topnav-link${section === link.section ? " active" : ""}`} aria-current={section === link.section ? "page" : undefined}>{link.label}</Link>)}
      </nav>
      <div className="topbar-meta"><span className="sim-chip">Simulation</span><span className="snapshot">{snapshotAt ? `Snapshot ${fmtDateTime(snapshotAt)}` : "Fictional snapshot"}</span></div>
    </header>
    <div className="main">{children}</div>
  </div>
}
