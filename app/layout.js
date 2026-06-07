import './globals.css'
import BugReportButton from '../components/BugReportButton'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

export const metadata = {
  title: 'Strategic Tracker',
  description: 'Weekly goal alignment between a manager and their direct reports',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
    apple: '/icon.svg',
  },
  openGraph: {
    title: 'Strategic Tracker',
    description: 'Weekly goal alignment between a manager and their direct reports',
    url: SITE_URL,
    siteName: 'Strategic Tracker',
    images: [{ url: `${SITE_URL}/icon.svg`, width: 512, height: 512, alt: 'Strategic Tracker' }],
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Strategic Tracker',
    description: 'Weekly goal alignment between a manager and their direct reports',
    images: [`${SITE_URL}/icon.svg`],
  },
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        <BugReportButton />
      </body>
    </html>
  )
}
