"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import type { User } from "@/lib/types";
import { Loading } from "./ui";

export function RequireAuth({ children }: { children: (user: User) => React.ReactNode }) {
  const { user, loading, signedOut } = useAuth();
  const router = useRouter();
  const path = usePathname();

  useEffect(() => {
    if (loading || user) return;
    router.replace(signedOut ? "/" : `/entrar?next=${encodeURIComponent(path + window.location.search)}`);
  }, [loading, user, signedOut, router, path]);

  if (loading || !user) return <Loading />;
  return <>{children(user)}</>;
}
