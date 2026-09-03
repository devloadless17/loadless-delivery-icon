import { Inter, JetBrains_Mono, Montserrat } from 'next/font/google';

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

export const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const fontVariables = `${inter.variable} ${montserrat.variable} ${jetbrainsMono.variable}`;
