import type { Metadata, Viewport } from "next";
import Nav from "./nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pantry Pilot",
  description: "Turn recipe screenshots into a meal plan, a grocery list and a Kroger cart.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#2f6b4f" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Courier+Prime:wght@400;700&display=swap"
        />
      </head>
      <body>
        <div className="shell">
          <header className="topbar">
            <a href="/" className="brand">Pantry Pilot</a>
            <Nav />
          </header>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
