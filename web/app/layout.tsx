import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Grand Secretariat',
  description: 'Collaborative workspace where humans and LLMs work together',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

