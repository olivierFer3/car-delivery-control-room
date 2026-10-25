import type { Metadata, Viewport } from "next"
export const metadata: Metadata = { title: "Bahn Express Driver Support", description: "Report a problem on the road and follow it live. Synthetic demo drivers and orders only." }
export const viewport: Viewport = { themeColor: "#26231f", width: "device-width", initialScale: 1 }
export default function DriverLayout({ children }: { children: React.ReactNode }) { return children }
