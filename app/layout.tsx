import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import FloatingLegalChat from "@/components/ai/FloatingLegalChat";
import AppShell from "@/components/layout/AppShell";
import { LegalWorkspaceProvider } from "@/context/LegalWorkspaceContext";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Machotes & Plantillas Jurídicas",
  description: "Sistema especializado de redacción de machotes, escritos iniciales, contestaciones y motor jurídico con IA.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es-MX" className={inter.variable}>
      <body className={`${inter.className} antialiased font-sans`}>
        <LegalWorkspaceProvider>
          <AppShell>
            {children}
          </AppShell>
          <FloatingLegalChat />
        </LegalWorkspaceProvider>
      </body>
    </html>
  );
}
