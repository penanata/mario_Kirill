import type { Metadata, Viewport } from "next";
import { Literata, Manrope } from "next/font/google";
import { Providers } from "@/components/providers";
import { Shell } from "@/components/shell";
import "./globals.css";

const sans = Manrope({ subsets: ["latin", "cyrillic"], variable: "--font-sans", display: "swap" });
const display = Literata({ subsets: ["latin", "cyrillic"], variable: "--font-display", display: "swap" });

export const metadata: Metadata = {
  title: "Life OS",
  description: "Персональная операционная система жизни: день, цели, календарь и ассистент.",
  applicationName: "Life OS",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Life OS", statusBarStyle: "default" },
  icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#f4f0e8",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className={`${sans.variable} ${display.variable} antialiased`}>
        <Providers>
          <Shell>{children}</Shell>
        </Providers>
      </body>
    </html>
  );
}
