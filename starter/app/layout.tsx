import type { Metadata, Viewport } from "next"
import "./globals.css"
import "./command-center.css"

export const metadata: Metadata = {
  title: "Car Delivery Control Room starter",
  description: "A fictional operations dataset and a simple read-only starting point.",
}

export const viewport: Viewport = { themeColor: "#f1eee7", width: "device-width", initialScale: 1 }

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        {/* Brand fallback faces: IBM Plex Sans for titles and reading, IBM Plex Mono for identifiers.
            Loaded from Google Fonts; without a network the stack falls back to Arial. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
