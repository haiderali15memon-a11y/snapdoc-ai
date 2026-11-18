import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "SnapDoc AI",
  description: "A free, private document scanner. Scan, enhance and export PDFs without creating an account.",
  applicationName: "SnapDoc AI",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "SnapDoc AI" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#F8F9FA",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
