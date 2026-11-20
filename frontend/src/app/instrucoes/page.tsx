"use client";

import { useCallback, useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { Alert, Empty, Loading } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import type { Instruction } from "@/lib/types";

const SUGGESTIONS = [
  { title: "Meu pet", body: "A Mel (gata) come 2x por dia. A ração fica no armário da cozinha. Veterinária: Dra. Ana, (71) 3333-0000." },
  { title: "Como entrar em casa", body: "Há uma cópia da chave com a vizinha do 102 (Dona Neide)." },
  { title: "Quem avisar", body: "Minha irmã Carla, em Recife: (81) 98888-0000." },
  { title: "Saúde", body: "Sou diabético(a). Remédios na gaveta do criado-mudo. Plano de saúde: …" },
];

function InstructionsPage() {
  const [list, setList] = useState<Instruction[] | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api<Instruction[]>("/me/instructions").then(setList).catch((e) => setError(e.message)), []);
  useEffect(() => {
    load();
  }, [load]);

  function reset() {
    setTitle("");
    setBody("");
    setEditing(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (editing) await api(`/me/instructions/${editing}`, { method: "PUT", body: { title, body } });
      else await api("/me/instructions", { body: { title, body } });
      reset();
      await load();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(i: Instruction) {
    if (!confirm(`Apagar a instrução "${i.title}"?`)) return;
    try {
      await api(`/me/instructions/${i.id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError((err as ApiError).message);
    }
  }

  return (
    <div className="stack">
      <div>
        <h1>Minhas instruções</h1>
        <p className="muted">
          O que seus Virgílios devem fazer se você sumir. Ficam criptografadas e <strong>só são mostradas a eles durante um alerta</strong>.
        </p>
      </div>
      <Alert>{error}</Alert>

      {list === null ? (
        <Loading />
      ) : list.length === 0 ? (
        <Empty>Nenhuma instrução ainda. Comece por uma das sugestões abaixo.</Empty>
      ) : (
        list.map((i) => (
          <div className="card" key={i.id}>
            <div className="instruction">
              <h3>{i.title}</h3>
              <p className="pre" style={{ marginBottom: 0 }}>
                {i.body}
              </p>
            </div>
            <div className="actions">
              <button
                className="btn secondary small"
                onClick={() => {
                  setEditing(i.id);
                  setTitle(i.title);
                  setBody(i.body);
                  window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
                }}
              >
                Editar
              </button>
              <button className="btn danger outline small" onClick={() => remove(i)}>
                Apagar
              </button>
            </div>
          </div>
        ))
      )}

      <form className="card" onSubmit={save}>
        <h2>{editing ? "Editar instrução" : "Nova instrução"}</h2>
        {!editing && (
          <div className="row mb">
            {SUGGESTIONS.map((s) => (
              <button
                type="button"
                key={s.title}
                className="btn secondary small"
                onClick={() => {
                  setTitle(s.title);
                  setBody(s.body);
                }}
              >
                + {s.title}
              </button>
            ))}
          </div>
        )}
        <div className="field">
          <label htmlFor="i-title">Título</label>
          <input id="i-title" required minLength={2} maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="i-body">O que fazer</label>
          <textarea id="i-body" required maxLength={4000} rows={5} value={body} onChange={(e) => setBody(e.target.value)} />
          <div className="hint">Evite senhas de banco. Prefira dizer com quem está a chave do que onde ela está escondida.</div>
        </div>
        <div className="row">
          <button className="btn" disabled={busy}>
            {editing ? "Salvar" : "Adicionar"}
          </button>
          {editing && (
            <button type="button" className="btn secondary" onClick={reset}>
              Cancelar
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

export default function Page() {
  return <RequireAuth>{() => <InstructionsPage />}</RequireAuth>;
}
