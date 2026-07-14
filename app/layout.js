import { Geist } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import LayoutWrapper from "@/components/Layout/LayoutWrapper";
import { Analytics } from "@vercel/analytics/next";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata = {
  title: {
    default: "AnonFeed - Anonymous Social Media Platform",
    template: "%s | AnonFeed"
  },
  description: "Say anything. Anonymously. Share your thoughts, stories, and connect with others without revealing your identity. A safe space for authentic expression.",
  keywords: ["anonymous social media", "anonymous posting", "share anonymously", "anonymous stories", "private social network", "AnonFeed"],
  authors: [{ name: "AnonFeed Team" }],
  creator: "AnonFeed",
  publisher: "AnonFeed",
  applicationName: "AnonFeed",
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || 'https://yourapp.com'),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: '/',
    title: 'AnonFeed - Anonymous Social Media Platform',
    description: 'Say anything. Anonymously. Share your thoughts, stories, and connect with others without revealing your identity.',
    siteName: 'AnonFeed',
    images: [
      {
        url: '/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'AnonFeed - Anonymous Social Media',
      }
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AnonFeed - Anonymous Social Media Platform',
    description: 'Say anything. Anonymously. Share your thoughts, stories, and connect with others.',
    images: ['/og-image.jpg'],
    creator: '@anonfeed',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  verification: {
    google: 'your-google-verification-code', // Replace with your Google Search Console verification code
    // yandex: 'your-yandex-verification-code',
    // bing: 'your-bing-verification-code',
  },
  category: 'social media',
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full`} suppressHydrationWarning>
      <head>
        <meta name="google-site-verification" content="OxJnDlxKld6R8V8RXE_SqynIk0LcRgZlRtpsCXOIGKc" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="AnonFeed" />
        <link rel="apple-touch-icon" href="/icon-192.svg" />
        <link rel="icon" href="/icon-192.svg" type="image/svg+xml" />
      </head>
      <body className="h-full bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 antialiased font-sans transition-colors duration-200">
        <Analytics/>
        <Providers>
          <LayoutWrapper>
            {children}
          </LayoutWrapper>
        </Providers>
      </body>
    </html>
  );
}
