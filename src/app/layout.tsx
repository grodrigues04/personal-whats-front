import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Personal Whats",
  description: "Fila e histórico das mensagens de WhatsApp",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
