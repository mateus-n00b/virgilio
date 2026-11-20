"use client";

import { useParams } from "next/navigation";
import { GuardianPanel } from "@/components/GuardianPanel";

export default function GuardianLinkPage() {
  const { token } = useParams<{ token: string }>();
  return <GuardianPanel token={token} />;
}
