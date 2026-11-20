"use client";

import { useParams } from "next/navigation";
import { GuardianPanel } from "@/components/GuardianPanel";

/** Mesmo conteúdo do link pessoal (/v/...); é o destino das notificações do app. */
export default function ProtectedPersonPage() {
  const { token } = useParams<{ token: string }>();
  return <GuardianPanel token={token} />;
}
