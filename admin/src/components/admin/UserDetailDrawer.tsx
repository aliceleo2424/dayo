"use client";

import { useEffect, useState } from "react";
import { X, Minus, Plus, Ticket } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProviderBadge, KakaoPrivateEmailHint } from "@/components/admin/provider-badge";
import {
  adjustProfileTickets,
  bookingStatusLabel,
  detectMemberProvider,
  fetchMemberBookings,
  formatSessionDateTime,
  normalizeCrmRole,
  profileDisplayName,
  type DrawerMember,
  type MemberBookingSession,
} from "@/lib/admin-data";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  user: DrawerMember | null;
  onClose: () => void;
  onTicketChange?: (userId: string, nextCount: number) => void;
};

export function UserDetailDrawer({ open, user, onClose, onTicketChange }: Props) {
  const [ticketCount, setTicketCount] = useState(0);
  const [sessions, setSessions] = useState<MemberBookingSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [busyTickets, setBusyTickets] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!open || !user) return;
    setTicketCount(Number(user.ticket_count || 0));
    setNotice("");

    let cancelled = false;
    setLoadingSessions(true);
    const learnerId = user.user_id || user.id;
    void fetchMemberBookings(learnerId)
      .then((rows) => {
        if (!cancelled) setSessions(rows);
      })
      .finally(() => {
        if (!cancelled) setLoadingSessions(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, user]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function changeTickets(delta: 1 | -1) {
    if (!user || busyTickets) return;
    const label = profileDisplayName(user);
    const next = Math.max(0, ticketCount + delta);
    if (delta < 0 && ticketCount <= 0) {
      window.alert("차감할 티켓이 없습니다.");
      return;
    }
    const ok = window.confirm(
      delta > 0
        ? `${label}님에게 티켓 1장을 지급할까요? (현재 ${ticketCount}장 → ${next}장)`
        : `${label}님의 티켓 1장을 차감할까요? (현재 ${ticketCount}장 → ${next}장)`
    );
    if (!ok) return;

    setBusyTickets(true);
    setNotice("");
    const prev = ticketCount;
    setTicketCount(next);
    onTicketChange?.(user.id, next);
    try {
      const saved = await adjustProfileTickets(user, next);
      setTicketCount(saved);
      onTicketChange?.(user.id, saved);
      setNotice(delta > 0 ? "티켓 1장이 지급되었습니다." : "티켓 1장이 차감되었습니다.");
    } catch (err) {
      setTicketCount(prev);
      onTicketChange?.(user.id, prev);
      setNotice(err instanceof Error ? err.message : "티켓 변경에 실패했습니다.");
    } finally {
      setBusyTickets(false);
    }
  }

  const provider = user ? detectMemberProvider(user) : "email";
  const role = normalizeCrmRole(user?.role);
  const displayName = user ? profileDisplayName(user) : "";

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-[60] bg-black/35 transition-opacity duration-300",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
        aria-hidden={!open}
      />
      <aside
        className={cn(
          "fixed right-0 top-0 z-[70] flex h-full w-full max-w-[560px] flex-col border-l bg-white shadow-2xl transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "translate-x-full"
        )}
        role="dialog"
        aria-modal="true"
        aria-hidden={!open}
        aria-label="회원 상세 관제"
      >
        <header className="flex items-start justify-between gap-3 border-b px-5 py-4">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-semibold text-[#292524]">{displayName || "회원"}</h2>
              <ProviderBadge provider={provider} />
              <Badge
                variant={
                  role === "admin" || role === "super_admin" || role === "superadmin"
                    ? "admin"
                    : role === "partner"
                      ? "success"
                      : "default"
                }
              >
                {role || "user"}
              </Badge>
            </div>
            <div className="text-sm text-muted-foreground">
              {user?.email ? user.email : provider === "kakao" ? <KakaoPrivateEmailHint /> : "이메일 미등록"}
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="닫기">
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <section className="rounded-2xl border bg-[#FAFAF9] p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#44403C]">
              <Ticket className="h-4 w-4 text-coral" />
              티켓 CS 수동 제어
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-[#57534E]">
                현재 보유 티켓{" "}
                <strong className="text-xl font-bold text-coral">{ticketCount}</strong>
                <span className="ml-1 text-muted-foreground">장</span>
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyTickets || !user}
                  onClick={() => void changeTickets(-1)}
                >
                  <Minus className="mr-1 h-3.5 w-3.5" />
                  -1 티켓 차감
                </Button>
                <Button
                  size="sm"
                  variant="coral"
                  disabled={busyTickets || !user}
                  onClick={() => void changeTickets(1)}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  +1 티켓 지급
                </Button>
              </div>
            </div>
            {notice && (
              <p className="mt-3 text-xs text-muted-foreground">{notice}</p>
            )}
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold text-[#44403C]">대화 세션 히스토리</h3>
            {loadingSessions ? (
              <div className="h-28 animate-pulse rounded-xl bg-muted" />
            ) : !sessions.length ? (
              <div className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                진행된 대화 세션 내역이 없습니다 ☕
              </div>
            ) : (
              <ul className="space-y-3">
                {sessions.map((session) => {
                  const status = bookingStatusLabel(session.status);
                  return (
                    <li key={session.id} className="rounded-2xl border bg-white p-4 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-[#292524]">
                            {formatSessionDateTime(session.scheduled_at)}
                          </p>
                          <p className="mt-1 text-sm text-[#57534E]">
                            매칭 파트너 · {session.partner_name || "파트너 미정"}
                          </p>
                        </div>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </div>
                      <div className="mt-3 text-sm text-[#44403C]">
                        {session.rating != null ? (
                          <span>
                            ★ {Number(session.rating).toFixed(1)}
                            {session.review ? (
                              <span className="ml-2 text-muted-foreground">&ldquo;{session.review}&rdquo;</span>
                            ) : null}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">평점·후기 없음</span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </aside>
    </>
  );
}
