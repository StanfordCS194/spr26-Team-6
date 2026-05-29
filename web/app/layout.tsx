import type { Metadata } from "next";
import { Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GovBid — Client dashboard",
  description:
    "RFP discovery and matching dashboard (GitHub Issues #13–#15 prototype)",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${plusJakarta.variable} ${geistMono.variable} flex h-dvh w-full flex-col overflow-hidden antialiased`}
    >
      <body className="flex h-dvh min-h-0 w-full flex-col overflow-hidden font-sans text-govbid-text">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
