"use client";

import { useEffect, useState } from "react";

/**
 * Modo de leitura fácil: letra maior e alto contraste, para quem enxerga com dificuldade.
 * A preferência fica só neste navegador e é aplicada como atributos no <html>
 * (data-text / data-contrast), antes da primeira pintura, pelo script em A11Y_BOOT.
 */
export type TextSize = "normal" | "grande" | "enorme";
export interface A11yPrefs {
  text: TextSize;
  contrast: boolean;
}

const KEY = "virgilio.a11y";
const DEFAULT: A11yPrefs = { text: "normal", contrast: false };
const EVENT = "virgilio:a11y";

export const TEXT_SIZES: { value: TextSize; label: string; sample: string }[] = [
  { value: "normal", label: "Normal", sample: "1rem" },
  { value: "grande", label: "Grande", sample: "1.2rem" },
  { value: "enorme", label: "Muito grande", sample: "1.4rem" },
];

/** Roda no <head>, antes do React: evita a página "piscar" em letra pequena. */
export const A11Y_BOOT = `try{var p=JSON.parse(localStorage.getItem("${KEY}")||"{}");var d=document.documentElement;if(p.text==="grande"||p.text==="enorme")d.setAttribute("data-text",p.text);if(p.contrast)d.setAttribute("data-contrast","alto")}catch(e){}`;

function read(): A11yPrefs {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || "{}");
    return {
      text: TEXT_SIZES.some((s) => s.value === p.text) ? p.text : "normal",
      contrast: p.contrast === true,
    };
  } catch {
    return DEFAULT;
  }
}

function apply(p: A11yPrefs) {
  const d = document.documentElement;
  if (p.text === "normal") d.removeAttribute("data-text");
  else d.setAttribute("data-text", p.text);
  if (p.contrast) d.setAttribute("data-contrast", "alto");
  else d.removeAttribute("data-contrast");
}

export function useA11y(): [A11yPrefs, (change: Partial<A11yPrefs>) => void] {
  const [prefs, setPrefs] = useState<A11yPrefs>(DEFAULT);

  useEffect(() => {
    setPrefs(read());
    const sync = () => setPrefs(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  function update(change: Partial<A11yPrefs>) {
    const next = { ...read(), ...change };
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* sem armazenamento: vale só nesta visita */
    }
    apply(next);
    setPrefs(next);
    window.dispatchEvent(new Event(EVENT));
  }

  return [prefs, update];
}
