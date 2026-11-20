import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { AppDownload } from "@/components/AppDownload";
import { Header } from "@/components/Header";
import { AuthProvider } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "Virgílio: ninguém atravessa sozinho",
  description:
    "Prova de vida periódica para quem mora só ou longe da família. Se você não responder, seus Virgílios (amigos, vizinhos, conhecidos) são avisados com as suas instruções.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#2f6b4f" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <AuthProvider>
          <Header />
          <main className="container">{children}</main>
          <footer className="footer">
            <div className="container">
              <span>
                © Virgílio · <em>ninguém atravessa sozinho</em>
              </span>
              <span className="row">
                <AppDownload variant="link" />
                <Link href="/termos">Termos de Uso</Link>
                <Link href="/privacidade">Política de Privacidade</Link>
              </span>
            </div>
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}
