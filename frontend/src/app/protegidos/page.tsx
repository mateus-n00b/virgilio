"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { Alert, Badge, Empty, Loading } from "@/components/ui";
import { api } from "@/lib/api";
import { relative, WATCH_STATE, watchStateKey } from "@/lib/format";
import type { Protecting } from "@/lib/types";

function ProtectingPage() {
  const [list, setList] = useState<Protecting[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<Protecting[]>("/me/protecting").then(setList).catch((e) => setError(e.message));
  }, []);

  return (
    <div className="stack">
      <div>
        <h1>Protegidos</h1>
        <p className="muted">Pessoas de quem você é Virgílio. Aparecem aqui os convites que você aceitou estando logado.</p>
      </div>
      <Alert>{error}</Alert>
      {list === null ? (
        !error && <Loading />
      ) : list.length === 0 ? (
        <Empty>
          Você ainda não é Virgílio de ninguém nesta conta. Se recebeu um convite, abra o link estando logado e marque “receber no app”.
        </Empty>
      ) : (
        list.map((p) => (
          <Link key={p.token} href={`/protegidos/${p.token}`} className="card person" style={{ textDecoration: "none" }}>
            <div className="avatar" aria-hidden>
              {p.person_name.slice(0, 1).toUpperCase()}
            </div>
            <div className="body">
              <div className="row between">
                <h3>{p.person_name}</h3>
                <Badge map={WATCH_STATE} value={watchStateKey(p)} />
              </div>
              <p className="muted small" style={{ margin: 0 }}>
                {p.alert ? (p.alert.reason === "SOS" ? "Pediu ajuda. Toque para ver as instruções." : "Sem sinal de vida. Toque para ver as instruções.") : `Última prova de vida ${relative(p.last_check_in_at)}.`}
              </p>
            </div>
          </Link>
        ))
      )}
    </div>
  );
}

export default function Page() {
  return <RequireAuth>{() => <ProtectingPage />}</RequireAuth>;
}
