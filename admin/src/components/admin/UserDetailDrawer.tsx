"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, Minus, Plus, Ticket, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ProviderBadge, KakaoPrivateEmailHint } from "@/components/admin/provider-badge";
import {
  adjustProfileTicketsWithLedger,
  bookingStatusLabel,
  detectMemberProvider,
  fetchCreditLedgers,
  fetchMemberBookings,
  fetchMemberOrders,
  formatSessionDateTime,
  formatWon,
  nearestTicketExpiry,
  normalizeCrmRole,
  orderStatusBadge,
  paymentMethodLabel,
  profileDisplayName,
  saveAdminMemo,
  type CreditLedgerRow,
  type DrawerMember,
  type MemberBookingSession,
  type MemberOrder,
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
  const [orders, setOrders] = useState<MemberOrder[]>([]);
  const [ledgers, setLedgers] = useState<CreditLedgerRow[]>([]);
  const [sessions, setSessions] = useState<MemberBookingSession[]>([]);
  const [memo, setMemo] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyTickets, setBusyTickets] = useState(false);
  const [busyMemo, setBusyMemo] = useState(false);
  const [notice, setNotice] = useState("");
  const [reasonOpen, setReasonOpen] = useState(false);
  const [pendingDelta, setPendingDelta] = useState<1 | -1>(1);
  const [reasonText, setReasonText] = useState("");
  const [transcriptSessionId, setTranscriptSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !user) return;
    setTicketCount(Number(user.ticket_count || 0));
    setMemo(String(user.admin_memo || ""));
    setNotice("");
    setOrders([]);
    setLedgers([]);
    setSessions([]);

    let cancelled = false;
    setLoading(true);
    const authId = user.user_id || user.id;

    void (async () => {
      try {
        const [orderRows, ledgerRows, bookingRows] = await Promise.all([
          fetchMemberOrders(authId).catch(() => [] as MemberOrder[]),
          fetchCreditLedgers(authId, user.id).catch(() => [] as CreditLedgerRow[]),
          fetchMemberBookings(authId).catch(() => [] as MemberBookingSession[]),
        ]);
        if (cancelled) return;
        setOrders(orderRows);
        setLedgers(ledgerRows);
        setSessions(bookingRows);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

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

  const expiry = useMemo(() => nearestTicketExpiry(orders), [orders]);
  const provider = user ? detectMemberProvider(user) : "email";
  const role = normalizeCrmRole(user?.role);
  const displayName = user ? profileDisplayName(user) : "";
  const kakaoId = String(user?.kakao_id || "").trim()
    || (provider === "kakao" ? String(user?.client_key || user?.id || "").slice(0, 12) : "");

  function openReasonModal(delta: 1 | -1) {
    if (!user || busyTickets) return;
    if (delta < 0 && ticketCount <= 0) {
      window.alert("차감할 티켓이 없습니다.");
      return;
    }
    setPendingDelta(delta);
    setReasonText(delta > 0 ? "관리자 CS 보상 지급" : "관리자 수동 차감");
    setReasonOpen(true);
  }

  async function confirmTicketChange() {
    if (!user || busyTickets) return;
    const next = Math.max(0, ticketCount + pendingDelta);
    const reason = String(reasonText || "").trim();
    if (!reason) {
      window.alert("변동 사유를 입력해 주세요.");
      return;
    }

    setBusyTickets(true);
    setNotice("");
    const prev = ticketCount;
    setTicketCount(next);
    onTicketChange?.(user.id, next);
    try {
      const saved = await adjustProfileTicketsWithLedger(user, next, pendingDelta, reason);
      setTicketCount(saved);
      onTicketChange?.(user.id, saved);
      setLedgers((cur) => [
        {
          id: `local-${Date.now()}`,
          created_at: new Date().toISOString(),
          delta: pendingDelta,
          reason,
          source: "admin_cs",
          balance_after: saved,
        },
        ...cur,
      ]);
      setNotice(pendingDelta > 0 ? "보상 티켓이 지급되었습니다." : "티켓이 차감되었습니다.");
      setReasonOpen(false);
    } catch (err) {
      setTicketCount(prev);
      onTicketChange?.(user.id, prev);
      setNotice(err instanceof Error ? err.message : "티켓 변경에 실패했습니다.");
    } finally {
      setBusyTickets(false);
    }
  }

  async function handleSaveMemo() {
    if (!user || busyMemo) return;
    setBusyMemo(true);
    setNotice("");
    try {
      await saveAdminMemo(user, memo);
      setNotice("CS 메모가 저장되었습니다.");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "메모 저장에 실패했습니다. admin_memo 컬럼을 확인해 주세요.");
    } finally {
      setBusyMemo(false);
    }
  }

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-[60] bg-black/35 transition-opacity duration-300",
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={onClose}
        aria-hidden={!open}
      />
      <aside
        className={cn(
          "fixed right-0 top-0 z-[70] flex h-full w-full max-w-[640px] flex-col border-l bg-white shadow-2xl transition-transform duration-300 ease-out",
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
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#78716C]">
              <span>가입 {user?.created_at ? formatSessionDateTime(user.created_at) : "—"}</span>
              {provider === "kakao" && kakaoId ? <span>kakao_id · {kakaoId}</span> : null}
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="닫기">
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {notice ? <p className="mb-3 text-xs text-muted-foreground">{notice}</p> : null}

          <Tabs defaultValue="billing" className="w-full">
            <TabsList className="mb-4 grid h-auto w-full grid-cols-3 gap-1">
              <TabsTrigger value="billing" className="text-xs sm:text-sm">💳 결제 및 티켓</TabsTrigger>
              <TabsTrigger value="sessions" className="text-xs sm:text-sm">☕ 대화 세션</TabsTrigger>
              <TabsTrigger value="memo" className="text-xs sm:text-sm">📝 CS 메모</TabsTrigger>
            </TabsList>

            <TabsContent value="billing" className="space-y-5">
              <section className="rounded-2xl border bg-[#FAFAF9] p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#44403C]">
                  <Ticket className="h-4 w-4 text-coral" />
                  티켓 상태 요약
                </div>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-sm text-[#57534E]">
                      현재 보유 티켓{" "}
                      <strong className="text-xl font-bold text-coral">{ticketCount}</strong>
                      <span className="ml-1 text-muted-foreground">장</span>
                    </p>
                    <p className="mt-2 text-xs text-[#78716C]">
                      {expiry
                        ? `${expiry.dateLabel} 만료 예정 / ${expiry.daysLeft >= 0 ? `D-${expiry.daysLeft}` : `D+${Math.abs(expiry.daysLeft)}`}`
                        : "만료 예정일 없음 (유료 결제 전)"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={busyTickets || !user} onClick={() => openReasonModal(-1)}>
                      <Minus className="mr-1 h-3.5 w-3.5" />-1 수동 차감
                    </Button>
                    <Button size="sm" variant="coral" disabled={busyTickets || !user} onClick={() => openReasonModal(1)}>
                      <Plus className="mr-1 h-3.5 w-3.5" />+1 보상 지급
                    </Button>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="mb-3 text-sm font-semibold text-[#44403C]">결제 히스토리</h3>
                {loading ? (
                  <div className="h-24 animate-pulse rounded-xl bg-muted" />
                ) : !orders.length ? (
                  <div className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                    결제 내역이 없습니다 (무료 체험 단계)
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {orders.map((order) => {
                      const badge = orderStatusBadge(order);
                      const orderNo = String(order.merchant_uid || order.id || "").slice(0, 8) || "—";
                      return (
                        <li key={order.id} className="rounded-2xl border bg-white p-4 shadow-sm">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold text-[#292524]">
                                {order.product_name || "이용권 패키지"}
                              </p>
                              <p className="mt-1 text-xs text-[#78716C]">
                                주문 {orderNo} · {formatSessionDateTime(order.created_at)}
                              </p>
                            </div>
                            <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold", badge.className)}>
                              {badge.label}
                            </span>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[#44403C]">
                            <span>{formatWon(order.amount)}</span>
                            <span className="text-muted-foreground">{paymentMethodLabel(order.payment_method)}</span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <section>
                <h3 className="mb-3 text-sm font-semibold text-[#44403C]">티켓 변동 이력</h3>
                {loading ? (
                  <div className="h-20 animate-pulse rounded-xl bg-muted" />
                ) : !ledgers.length ? (
                  <div className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                    변동 이력이 아직 없습니다
                  </div>
                ) : (
                  <ul className="space-y-2 border-l-2 border-[#E7E5E4] pl-4">
                    {ledgers.map((row) => (
                      <li key={row.id} className="relative pb-3">
                        <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-coral" />
                        <p className="text-xs text-[#78716C]">{formatSessionDateTime(row.created_at)}</p>
                        <p className="text-sm font-medium text-[#292524]">
                          <span className={row.delta >= 0 ? "text-emerald-700" : "text-red-600"}>
                            {row.delta >= 0 ? `+${row.delta}` : row.delta}
                          </span>
                          <span className="ml-2 text-[#57534E]">{row.reason || "사유 미기록"}</span>
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </TabsContent>

            <TabsContent value="sessions" className="space-y-3">
              {loading ? (
                <div className="h-28 animate-pulse rounded-xl bg-muted" />
              ) : !sessions.length ? (
                <div className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                  진행된 대화 세션 내역이 없습니다 ☕
                </div>
              ) : (
                sessions.map((session) => {
                  const status = bookingStatusLabel(session.status);
                  return (
                    <div key={session.id} className="rounded-2xl border bg-white p-4 shadow-sm">
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
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        onClick={() => setTranscriptSessionId(session.id)}
                      >
                        <FileText className="mr-1 h-3.5 w-3.5" />
                        대화록 & 리포트 확인
                      </Button>
                    </div>
                  );
                })
              )}
            </TabsContent>

            <TabsContent value="memo" className="space-y-3">
              <Label htmlFor="admin-cs-memo">CS 특이사항</Label>
              <Textarea
                id="admin-cs-memo"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="환불 요청, 노쇼 이력, 보상 지급 사유 등 내부 메모를 남겨 주세요."
                className="min-h-[220px]"
              />
              <Button variant="coral" disabled={busyMemo || !user} onClick={() => void handleSaveMemo()}>
                {busyMemo ? "저장 중…" : "메모 저장"}
              </Button>
            </TabsContent>
          </Tabs>
        </div>
      </aside>

      {reasonOpen ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-xl border bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold">{pendingDelta > 0 ? "+1 보상 지급" : "-1 수동 차감"}</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {displayName}님 티켓 {ticketCount}장 → {Math.max(0, ticketCount + pendingDelta)}장
            </p>
            <div className="mt-3">
              <Label htmlFor="ticket-reason">변동 사유</Label>
              <Textarea
                id="ticket-reason"
                className="mt-1 min-h-[100px]"
                value={reasonText}
                onChange={(e) => setReasonText(e.target.value)}
                placeholder="예: 세션 장애 보상 / 중복 결제 수동 차감"
              />
            </div>
            <div className="mt-4 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setReasonOpen(false)}>취소</Button>
              <Button variant="coral" className="flex-1" disabled={busyTickets} onClick={() => void confirmTicketChange()}>
                확인 및 반영
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {transcriptSessionId ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-xl border bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold">대화록 & 리포트</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              SessionTranscriptModal 연동 준비 중입니다. (session: {transcriptSessionId.slice(0, 8)})
            </p>
            <Button className="mt-4 w-full" variant="outline" onClick={() => setTranscriptSessionId(null)}>
              닫기
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
