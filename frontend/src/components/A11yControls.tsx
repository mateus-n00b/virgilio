"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { TEXT_SIZES, useA11y } from "@/lib/a11y";

/** Os controles em si: tamanho da letra e alto contraste. */
export function A11yControls() {
  const [prefs, update] = useA11y();
  return (
    <div className="a11y-controls">
      <fieldset>
        <legend>Tamanho da letra</legend>
        <div className="a11y-sizes" role="radiogroup" aria-label="Tamanho da letra">
          {TEXT_SIZES.map((s) => (
            <button
              key={s.value}
              type="button"
              role="radio"
              aria-checked={prefs.text === s.value}
              className={prefs.text === s.value ? "active" : ""}
              onClick={() => update({ text: s.value })}
            >
              <span aria-hidden="true" style={{ fontSize: s.sample, fontWeight: 800, lineHeight: 1 }}>
                A
              </span>
              {s.label}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="checkbox a11y-contrast">
        <input type="checkbox" checked={prefs.contrast} onChange={(e) => update({ contrast: e.target.checked })} />
        <span>
          <strong>Alto contraste</strong>
          <span className="hint" style={{ display: "block" }}>
            Cores mais fortes, bordas marcadas e links sublinhados.
          </span>
        </span>
      </label>
    </div>
  );
}

/** Botão "Aa" do cabeçalho, que abre os controles. */
export function A11yMenu() {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div className="a11y-menu" ref={box}>
      <button
        type="button"
        className="a11y-btn"
        aria-expanded={open}
        aria-controls="a11y-panel"
        title="Letra maior e alto contraste"
        onClick={() => setOpen((o) => !o)}
      >
        <span aria-hidden="true">Aa</span>
        <span className="sr-only">Acessibilidade: letra maior e alto contraste</span>
      </button>
      {open && (
        <div id="a11y-panel" className="a11y-panel card" role="dialog" aria-label="Acessibilidade">
          <h3>Facilitar a leitura</h3>
          <A11yControls />
          <p className="small muted" style={{ margin: "12px 0 0" }}>
            Fica guardado neste aparelho. <Link href="/ajuda" onClick={() => setOpen(false)}>Ver o tutorial do site</Link>
          </p>
        </div>
      )}
    </div>
  );
}
