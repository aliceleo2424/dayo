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

    async function checkAdminAuth() {
      try {
        if (!supabase?.auth?.getSession) {
          alert("관리자 로그인이 필요한 페이지입니다.");
          window.location.href = "/";
          return;
        }

        const sessionRes = await supabase.auth.getSession();
        const session = sessionRes?.data?.session ?? null;
        const sessionError = sessionRes?.error;

        if (sessionError || !session || !session.user) {
          alert("관리자 로그인이 필요한 페이지입니다.");
          window.location.href = "/";
          return;
        }

        const role = await fetchProfileRole(session.user.id);
        if (cancelled) return;

        if (role === "admin") {
          setAllowed(true);
          return;
        }

        alert("관리자(Admin) 권한이 없습니다.");
        window.location.href = "/";
      } catch (err) {
        console.error("Admin Auth Error:", err);
        if (cancelled) return;
        alert("인증 확인 중 오류가 발생했습니다. 메인 페이지로 이동합니다.");
        window.location.href = "/";
      }
    }

    checkAdminAuth();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!allowed) {
    return (
      <div
        id="admin-loading"
        className="admin-loading-screen flex min-h-screen items-center justify-center text-sm text-muted-foreground"
      >
        관리자 권한을 확인하는 중...
      </div>
    );
  }

  return <>{children}</>;
}
