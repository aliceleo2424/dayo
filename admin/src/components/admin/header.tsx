"use client";

import { useEffect, useState } from "react";
import { Bell, LogOut, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAdminAuth } from "@/components/admin/admin-auth-guard";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

type Alert = { id: string; title: string | null; message: string | null; created_at: string };

export function AdminHeader({ title, compactMobile = false }: { title: string; compactMobile?: boolean }) {
  const router = useRouter();
  const admin = useAdminAuth();
  const [urgent, setUrgent] = useState<Alert[]>([]);
  const [bellOpen, setBellOpen] = useState(false);
  const urgentCount = urgent.length;
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let active = true;
    async function refreshUrgentCount() {
      const result = await supabase
        .from("admin_notifications")
        .select("id,title,message,created_at")
        .eq("kind", "safety_emergency")
        .is("read_at", null)
        .order("created_at", { ascending: false })
        .limit(20);
      if (active && !result.error) setUrgent((result.data || []) as Alert[]);
    }
    void refreshUrgentCount();
    const channel = supabase
      .channel("admin-safety-notifications")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "admin_notifications" }, () => {
        void refreshUrgentCount();
      })
      .subscribe();
    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, []);

  async function markRead(id: string) {
    const { error } = await supabase.from("admin_notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
    if (!error) setUrgent(prev => prev.filter(a => a.id !== id));
  }

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className={cn(
      "sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-[#FFFBF4]/95 px-6 backdrop-blur supports-[backdrop-filter]:bg-[#FFFBF4]/95",
      compactMobile && "gap-2 px-4 md:px-6"
    )}>
      <div className="flex min-w-0 items-center gap-3">
        {/* The sidebar already shows the DayO logo; on mobile (sidebar hidden) keep a small home link. */}
        <Link href="/admin/dashboard" className={cn("hidden shrink-0 items-center", compactMobile && "flex md:hidden")}>
          <img src="/images/logo_header.png" alt="DayO" className="h-7 w-auto max-w-[6rem] object-contain bg-transparent" />
        </Link>
        <h1 className={cn("truncate text-xl font-semibold text-navy", compactMobile && "text-base md:text-xl")}>{title}</h1>
      </div>
      <div className={cn("flex items-center gap-3", compactMobile && "shrink-0 gap-1 md:gap-3")}>
        <Badge variant="coral" className={cn(compactMobile && "hidden md:inline-flex")}>Admin</Badge>
        <div className="relative">
          <Button variant="ghost" size="icon" className="relative" title={`긴급 안전 알림 ${urgentCount}건`} aria-expanded={bellOpen} onClick={() => setBellOpen(v => !v)}>
            <Bell className="h-4 w-4" />
            {urgentCount > 0 && (
              <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">
                {urgentCount > 99 ? "99+" : urgentCount}
              </span>
            )}
          </Button>
          {bellOpen && (
            <div role="dialog" aria-label="긴급 안전 알림" className="absolute right-0 top-11 z-40 w-80 rounded-xl border bg-white p-3 text-sm shadow-lg">
              <p className="mb-2 font-semibold">긴급 안전 알림</p>
              {urgent.length === 0 ? <p className="py-3 text-muted-foreground">새 긴급 알림이 없어요.</p> : (
                <ul className="max-h-80 space-y-2 overflow-y-auto">
                  {urgent.map(a => <li key={a.id} className="rounded-lg border border-rose-200 bg-rose-50 p-2">
                    <p className="font-medium text-rose-800">{a.title || "안전 신고"}</p>
                    {a.message && <p className="mt-0.5 line-clamp-3 text-xs text-stone-600">{a.message}</p>}
                    <div className="mt-1 flex items-center justify-between text-xs text-stone-500">
                      <span>{new Date(a.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</span>
                      <button type="button" className="font-medium text-rose-700 hover:underline" onClick={() => void markRead(a.id)}>확인함</button>
                    </div>
                  </li>)}
                </ul>
              )}
              <Link href="/admin/tech-issues" className="mt-2 block text-right text-xs font-medium text-[#C2410C] hover:underline" onClick={() => setBellOpen(false)}>기술문제 신고 검토 →</Link>
            </div>
          )}
        </div>
        <div className={cn("flex items-center gap-2 rounded-full border px-3 py-1.5", compactMobile && "hidden md:flex")}>
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-navy text-xs text-white">
            <User className="h-3.5 w-3.5" />
          </div>
          <span className="max-w-36 truncate text-sm font-medium" title={admin.email}>{admin.displayName}</span>
        </div>
        <Button variant="ghost" size="sm" aria-label="로그아웃" onClick={() => void signOut()} disabled={signingOut}>
          <LogOut className={cn("mr-1.5 h-4 w-4", compactMobile && "mr-0 md:mr-1.5")} />
          <span className={cn(compactMobile && "hidden md:inline")}>로그아웃</span>
        </Button>
      </div>
    </header>
  );
}
