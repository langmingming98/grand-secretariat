import type { Metadata } from 'next'
import {
  DM_Sans,
  Noto_Serif_TC,
  Crimson_Pro,
  Zhi_Mang_Xing,
} from 'next/font/google'
import './globals.css'

// DM Sans - Geometric humanist sans (similar to Styrene B)
const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

// Crimson Pro - Elegant serif for English headers/marketing
const crimsonPro = Crimson_Pro({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
})

// Noto Serif TC - Traditional Chinese for all Chinese text
const notoSerifTC = Noto_Serif_TC({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-serif-tc',
  display: 'swap',
})

// Zhi Mang Xing - Calligraphy for logo only (內閣)
const zhiMangXing = Zhi_Mang_Xing({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-brush',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Grand Secretariat | 內閣',
  description: 'Collaborative AI council where humans and LLMs deliberate together',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="zh-Hant"
      className={`${dmSans.variable} ${crimsonPro.variable} ${notoSerifTC.variable} ${zhiMangXing.variable}`}
    >
      <body className="font-sans antialiased">{children}</body>
    </html>
  )
}
