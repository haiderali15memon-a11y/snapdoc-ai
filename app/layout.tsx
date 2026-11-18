import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SnapDoc AI",
  description: "100% Free AI Document Scanner & PDF Converter",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
