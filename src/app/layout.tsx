import type { Metadata, Viewport } from "next";
import "./globals.css";
import { DEFAULT_THEMES, themeCss } from "@/lib/themeTokens";

export const metadata: Metadata = {
  title: "ABRAKADABRA 9 — Penilaian Lomba Pramuka",
  description:
    "Aplikasi penilaian Lomba Pramuka ABRAKADABRA 9 SMK Telkom 1 Medan: LKBB, Pionering, LCTP, dan Scouting Skill.",
  manifest: "/manifest.webmanifest",
  applicationName: "ABRAKADABRA 9",
  appleWebApp: { capable: true, title: "ABRAKADABRA 9", statusBarStyle: "default" },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#5E3E2E",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" style={themeCss(DEFAULT_THEMES.peserta)}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
