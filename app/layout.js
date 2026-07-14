import { Geist } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import LayoutWrapper from "@/components/Layout/LayoutWrapper";
import { Analytics } from "@vercel/analytics/next"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata = {
  title: "AnonFeed",
  description: "Say anything. Anonymously.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full`} suppressHydrationWarning>
      <meta name="google-site-verification" content="OxJnDlxKld6R8V8RXE_SqynIk0LcRgZlRtpsCXOIGKc" />
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
