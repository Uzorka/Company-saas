import type { Metadata } from "next";
import { Manrope, Plus_Jakarta_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

/**
 * The tenant's typefaces: Plus Jakarta Sans for interface, Manrope for display.
 * Both are what chfheron.com loads, so the product reads as theirs rather than
 * as a generic admin tool wearing their colours.
 *
 * IBM Plex Mono stays for every figure that can be compared vertically — IDs,
 * coordinates, timestamps, currency, accuracy. Their site specifies no
 * monospace, and a tabular figure is a product concern rather than a brand one.
 */
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-sans-tenant",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const manrope = Manrope({
  variable: "--font-display-tenant",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
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
    // The font variables go on <html>, not <body>, and that placement is the
    // whole thing working.
    //
    // `--font-sans` is declared in @theme, which emits it at :root. A custom
    // property whose value contains var() is resolved where it is *declared* —
    // so with the font variables on <body>, `--font-sans` resolved at :root
    // against a variable that was not there, became invalid at computed-value
    // time, and every element fell back to the browser's system stack.
    //
    // The product had rendered in -apple-system since Phase 1. The design
    // specified IBM Plex Sans and never got it; nothing failed, nothing warned,
    // and the page looked plausible the whole time.
    <html
      lang="en"
      className={`${jakarta.variable} ${manrope.variable} ${plexMono.variable}`}
      style={{ colorScheme: "light" }}
    >
      <body>
        {children}
      </body>
    </html>
  );
}
