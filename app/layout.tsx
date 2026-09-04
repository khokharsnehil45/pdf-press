import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PDF-PRESS // 100% Client-Side Private PDF Compressor",
  description: "Compress PDFs offline with zero cloud uploads. High-throughput Swiss Neo-Brutalist document compression engine.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "PDF-PRESS",
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/icon-192.png",
  },
  keywords: ["pdf compressor", "offline pdf compress", "client side pdf", "private pdf compression", "shrink pdf size"],
  authors: [{ name: "PDF-PRESS Engine" }],
};

export const viewport: Viewport = {
  themeColor: "#ffb703",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
