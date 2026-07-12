import { Geist } from "next/font/google";
import "./globals.css";
import { UserProvider } from "@/context/UserContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata = {
  title: "Instagram",
  description: "Instagram Clone",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full`}>
      <body className="h-full bg-white text-gray-900 antialiased font-sans">
        <UserProvider>
          {children}
        </UserProvider>
      </body>
    </html>
  );
}
