"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

async function fetchProfileRole(userId: string): Promise<string | null> {
  const byId = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (byId.data?.role) return byId.data.role;

  const byUserId = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  return byUserId.data?.role ?? null;
}

export function AdminAuthGuard({ children }: { children: React.ReactNode }) {
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function enforce(session: { user?: { id: string } } | null) {
      if (!session?.user) {
        window.location.replace("/");
        return;
      }
      try {
        const role = await fetchProfileRole(session.user.id);
        if (cancelled) return;
        if (role !== "admin") {
          window.location.replace("/");
          return;
        }
        setAllowed(true);
      } catch {
        if (!cancelled) window.location.replace("/");
      }
    }

    supabase.auth.getSession().then(({ data }) => {
      enforce(data.session);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      enforce(session);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (!allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        관리자 권한을 확인하는 중…
      </div>
    );
  }

  return <>{children}</>;
}
