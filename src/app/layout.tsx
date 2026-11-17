import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shapect — Experience Network demo",
  description: "Passion Built: a renovation website as a connected network of customer experiences.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={GeistSans.variable}>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
