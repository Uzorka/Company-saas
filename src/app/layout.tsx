import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

/**
 * IBM Plex Sans for interface, IBM Plex Mono for every figure that can be
 * compared vertically — IDs, coordinates, timestamps, currency, accuracy.
 */
const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Heron",
    template: "%s · Heron",
  },
  description:
    "Multi-tenant company management — people, attendance verification, field visits, leave, payroll and recruitment.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // Light mode only for now, declared explicitly so the browser does not
    // apply a dark UA stylesheet. See DECISIONS.md D4.
    <html lang="en" style={{ colorScheme: "light" }}>
      <body className={`${plexSans.variable} ${plexMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
