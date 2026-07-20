import { Geist } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import LayoutWrapper from "@/components/Layout/LayoutWrapper";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata = {
  title: {
    default: "AnonTweet - Anonymous Social Media & Messaging Platform",
    template: "%s | AnonTweet"
  },
  description: "AnonTweet is an anonymous social media platform to post, share stories, send messages, go live, and play games — all without revealing your identity. Speak freely. Join anonymous communities, trending feeds, and private chats.",
  keywords: [
    "anonymous social media",
    "anonymous posting",
    "post anonymously",
    "anonymous stories",
    "anonymous app",
    "private social network",
    "anonymous messaging",
    "secret social app",
    "anonymous chat",
    "anonymous community",
    "no name social media",
    "anonymous feed",
    "trending anonymous posts",
    "AnonTweet",
    "anonymous live streaming",
    "anonymous video call",
    "private message app",
    "anonymous social network",
    "say anything anonymously",
    "hide identity social app",
    "confession app",
    "anonymous thoughts",
  ],
  authors: [{ name: "AnonTweet Team" }],
  creator: "AnonTweet",
  publisher: "AnonTweet",
  applicationName: "AnonTweet",
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || 'https://anontweet.duckdns.org'),
  alternates: {
    canonical: '/',
    languages: {
      'en-US': '/',
    },
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: '/',
    siteName: 'AnonTweet',
    title: 'AnonTweet - Anonymous Social Media & Messaging Platform',
    description: 'Post, message, go live, and play games — all anonymously. Speak freely on AnonTweet, the private social network.',
    images: [
      {
        url: '/icon-512.svg',
        width: 512,
        height: 512,
        alt: 'AnonTweet - Anonymous Social Media',
        type: 'image/svg+xml',
      }
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AnonTweet - Anonymous Social Media & Messaging Platform',
    description: 'Post, message, go live, and play games — all anonymously. Speak freely on AnonTweet.',
    images: ['/icon-512.svg'],
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
  classification: 'social networking',
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": "https://anontweet.duckdns.org/#website",
      url: "https://anontweet.duckdns.org",
      name: "AnonTweet",
      description:
        "Anonymous social media platform to post, message, go live, and play games without revealing your identity.",
      inLanguage: "en-US",
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate:
            "https://anontweet.duckdns.org/search?q={search_term_string}",
        },
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@type": "Organization",
      "@id": "https://anontweet.duckdns.org/#organization",
      name: "AnonTweet",
      url: "https://anontweet.duckdns.org",
      logo: "https://anontweet.duckdns.org/icon-512.svg",
      sameAs: [],
    },
    {
      "@type": "WebApplication",
      name: "AnonTweet",
      url: "https://anontweet.duckdns.org",
      applicationCategory: "SocialNetworkingApplication",
      operatingSystem: "Web, iOS, Android",
      description:
        "Post anonymously, send private messages, go live, and play games — all without revealing your identity.",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
    },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full`} suppressHydrationWarning>
      <head>
        <meta name="google-site-verification" content="OxJnDlxKld6R8V8RXE_SqynIk0LcRgZlRtpsCXOIGKc" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <link rel="manifest" href="/manifest.json" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="AnonTweet" />
        <link rel="apple-touch-icon" href="/icon-192.svg" />
        <link rel="icon" href="/icon-192.svg" type="image/svg+xml" />
      </head>
      <body className="h-full bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 antialiased font-sans transition-colors duration-200">
        <Analytics/>
        <SpeedInsights/>
        <Providers>
          <LayoutWrapper>
            {children}
          </LayoutWrapper>
        </Providers>
      </body>
    </html>
  );
}
