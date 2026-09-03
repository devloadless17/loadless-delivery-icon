import { Inter, JetBrains_Mono, Montserrat, Noto_Sans_Arabic } from 'next/font/google';

export const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

// Montserrat is the brand typeface (Flash Delivery brand sheet). It carries the
// display voice — wordmark, headings, buttons — while Inter stays the body face
// for dense operational text (tables, forms) where a geometric sans tires faster.
export const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-montserrat',
  display: 'swap',
});

// Inter, Montserrat and JetBrains Mono are Latin-only families — Arabic text
// in the vendor and driver apps would otherwise fall back to whatever the
// device happens to ship. Noto Sans Arabic is appended to the --font-sans and
// --font-display chains in globals.css, so the browser reaches for it only for
// glyphs the Latin faces do not cover; Latin text is untouched.
export const notoArabic = Noto_Sans_Arabic({
  subsets: ['arabic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-noto-arabic',
  display: 'swap',
});

export const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const fontVariables = `${inter.variable} ${montserrat.variable} ${notoArabic.variable} ${jetbrainsMono.variable}`;
