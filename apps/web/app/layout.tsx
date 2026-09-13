import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpenPoker Club",
  description: "Texas Hold'em NLHE contra jugadores y mesas de práctica en simultáneo.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
