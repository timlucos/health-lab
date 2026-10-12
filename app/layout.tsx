import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Shell } from "@/components/Shell";

export const metadata: Metadata = {
  title: "Здоровье Лаб",
  description: "Данные Fitbit Air из Google Health: сон, пульс, нагрузка и восстановление.",
  appleWebApp: { capable: true, title: "Здоровье Лаб", statusBarStyle: "default" },
  icons: { icon: "/icon.svg", apple: "/apple-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f2f7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
