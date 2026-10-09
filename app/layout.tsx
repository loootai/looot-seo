import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "looot seo", template: "%s · looot seo" },
  description: "Rank tracking, keyword research, SERP snapshots, competitors and backlinks, with the price of every refresh shown before it runs.",
  icons: { icon: [{ url: "/brand/looot-mark.svg", type: "image/svg+xml" }, { url: "/brand/favicon-32.png", sizes: "32x32" }] },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F7F8F5" },
    { media: "(prefers-color-scheme: dark)", color: "#08130F" },
  ],
};

// Runs before paint: applies the saved theme and rail state so neither flashes. ?theme=dark or ?theme=light wins for one load.
const boot = `(function(){try{var d=document.documentElement,q=new URLSearchParams(location.search).get('theme'),t=q||localStorage.getItem('seo-theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');if(t==='dark')d.classList.add('dark');if(localStorage.getItem('seo-rail')==='collapsed')d.setAttribute('data-rail','collapsed')}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: boot }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
