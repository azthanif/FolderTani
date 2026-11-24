import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { DialogHost } from "@/components/DialogHost";
import { WaButton } from "@/components/WaButton";

// Font di-host sendiri (paket @fontsource-variable) agar build tidak bergantung pada Google Fonts.
const dmSans = localFont({
  src: "../node_modules/@fontsource-variable/dm-sans/files/dm-sans-latin-wght-normal.woff2",
  weight: "100 1000",
  variable: "--font-dm-sans",
  display: "swap",
});
const jakarta = localFont({
  src: "../node_modules/@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2",
  weight: "200 800",
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: "TemuTani",
  description:
    "TemuTani menghubungkan petani dan pembeli melalui informasi harga gabah dan ekosistem digital MaxxiTani. Jelajahi informasi dan prototipe berdasarkan peran.",
  icons: { icon: "/assets/logo-temutani-bg-white.png" },
};

export const viewport: Viewport = { themeColor: "#153d30", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" className={`${dmSans.variable} ${jakarta.variable}`}>
      <body>
        {children}
        <WaButton />
        <DialogHost />
      </body>
    </html>
  );
}
