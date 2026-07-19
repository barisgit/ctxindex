import { RootProvider } from 'fumadocs-ui/provider/next'
import './global.css'
import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import { BrandLockupDefs } from '@/components/brand-lockup-defs'
import { pageMetadataUrls, resolveSiteOrigin } from '@/lib/shared'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
})

const homeUrls = pageMetadataUrls('/')

export const metadata: Metadata = {
  metadataBase: resolveSiteOrigin(),
  title: {
    default: 'ctxindex — your context, one command away',
    template: '%s | ctxindex',
  },
  description:
    'A local personal-context gateway for agents. One deterministic CLI to discover, retrieve, and act on mail, calendars, and files across every account.',
  alternates: homeUrls ? { canonical: homeUrls.canonical } : undefined,
  openGraph: homeUrls ? { url: homeUrls.canonical } : undefined,
}

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${inter.className} ${inter.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <body className="flex flex-col min-h-screen">
        <BrandLockupDefs />
        <RootProvider theme={{ defaultTheme: 'dark' }}>{children}</RootProvider>
      </body>
    </html>
  )
}
