"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Badge({ map, value }: { map: Record<string, { label: string; tone: string }>; value: string }) {
  const s = map[value] ?? { label: value, tone: "muted" };
  return <span className={`badge ${s.tone}`}>{s.label}</span>;
}

export function Alert({ kind = "error", children }: { kind?: "error" | "success" | "warn" | "info"; children: React.ReactNode }) {
  if (!children) return null;
  return (
    <div className={`alert ${kind}`} role={kind === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}

export function Loading() {
  return <p className="muted">Carregando…</p>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty card">{children}</div>;
}

export function SubNav({ items }: { items: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <nav className="subnav">
      {items.map((i) => {
        const active = path === i.href || (i.href.split("/").length > 2 && path.startsWith(i.href + "/"));
        return (
          <Link key={i.href} href={i.href} className={active ? "active" : ""}>
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function Tabs<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="tabs" role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={o.value === value} className={o.value === value ? "active" : ""} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
