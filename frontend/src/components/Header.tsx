"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { A11yMenu } from "@/components/A11yControls";
import { useAuth } from "@/lib/auth";

export function Header() {
  const { user, signOut } = useAuth();
  const path = usePathname();
  const router = useRouter();
  const link = (href: string, label: string) => (
    <Link href={href} className={path === href || (href !== "/" && path.startsWith(href)) ? "active" : ""}>
      {label}
    </Link>
  );

  return (
    <header className="header">
      <div className="container">
        <Link href="/" className="logo">
          <img src="/logo.svg" alt="" />
          Virgílio
        </Link>
        <nav className="nav">
          {user ? (
            <>
              {link("/", "Prova de vida")}
              {link("/virgilios", "Meus Virgílios")}
              {link("/instrucoes", "Instruções")}
              {link("/protegidos", "Protegidos")}
              {link("/ajuda", "Ajuda")}
              {user.is_admin && link("/admin", "Admin")}
              {link("/conta", user.name.split(" ")[0])}
              <button
                className="link"
                style={{ textDecoration: "none", color: "var(--muted)" }}
                onClick={() => {
                  signOut();
                  router.push("/");
                }}
              >
                Sair
              </button>
            </>
          ) : (
            <>
              {link("/ajuda", "Como usar")}
              {link("/entrar", "Entrar")}
              <Link href="/entrar?criar=1" className="btn small">
                Criar conta
              </Link>
            </>
          )}
          <A11yMenu />
        </nav>
      </div>
    </header>
  );
}
