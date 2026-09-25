"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, Mail, Minus, Plus, Ticket, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ProviderBadge, KakaoPrivateEmailHint } from "@/components/admin/provider-badge";
import { SessionTranscriptModal } from "@/components/admin/SessionTranscriptModal";
import {
  grantAdminTickets,
  bookingStatusLabel,
  detectMemberProvider,
  fetchAdminMemo,
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
  type SessionTranscriptContext,
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
  const [busyWelcome, setBusyWelcome] = useState(false);
  const [notice, setNotice] = useState("");
  const [memoNotice, setMemoNotice] = useState("");
  const [memoError, setMemoError] = useState("");
  const [reasonOpen, setReasonOpen] = useState(false);
  const [grantAttempt, setGrantAttempt] = useState<{ userId: string; sourceId: string; reason: string } | null>(null);
  const [reasonText, setReasonText] = useState("");
  const [selectedSession, setSelectedSession] = useState<SessionTranscriptContext | null>(null);
  const grantInFlightRef = useRef(false);

  useEffect(() => {
    if (!open || !user) return;
    setTicketCount(Number(user.ticket_count || 0));
    setMemo(String(user.admin_memo || ""));
    setNotice("");
    setMemoNotice("");
    setMemoError("");
    setOrders([]);
    setLedgers([]);
    setSessions([]);
    try {
      const stored = window.sessionStorage.getItem(`dayo_admin_grant_pending:${user.id}`);
      const attempt = stored ? JSON.parse(stored) as { userId?: string; sourceId?: string; reason?: string } : null;
      setGrantAttempt(attempt?.userId === user.id && attempt.sourceId && attempt.reason
        ? { userId: user.id, sourceId: attempt.sourceId, reason: attempt.reason }
        : null);
    } catch {
      setGrantAttempt(null);
    }

    let cancelled = false;
    setLoading(true);
    const authId = user.user_id || user.id;

    void (async () => {
      try {
        const [orderRows, ledgerRows, bookingRows, memoResult] = await Promise.all([
          fetchMemberOrders(authId).catch(() => [] as MemberOrder[]),
          fetchCreditLedgers(authId, user.id).catch(() => [] as CreditLedgerRow[]),
          fetchMemberBookings(authId).catch(() => [] as MemberBookingSession[]),
          fetchAdminMemo(user.id)
            .then((value) => ({ value, error: "" }))
            .catch((err) => ({ value: "", error: err instanceof Error ? err.message : "CS 메모를 불러오지 못했습니다." })),
        ]);
        if (cancelled) return;
        setOrders(orderRows);
        setLedgers(ledgerRows);
        setSessions(bookingRows);
        if (memoResult.error) setMemoError(memoResult.error);
        else setMemo(memoResult.value);
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

  function openReasonModal() {
    if (!user || busyTickets) return;
    setReasonText(grantAttempt?.userId === user.id ? grantAttempt.reason : "관리자 CS 보상 지급");
    setReasonOpen(true);
  }

  async function confirmTicketChange() {
    if (!user || busyTickets || grantInFlightRef.current) return;
    const reason = String(reasonText || "").trim();
    if (!reason) {
      window.alert("변동 사유를 입력해 주세요.");
      return;
    }
    if (reason.length > 500) {
      window.alert("변동 사유는 500자 이내로 입력해 주세요.");
      return;
    }
    if (grantAttempt?.userId === user.id && grantAttempt.reason !== reason) {
      window.alert("진행 중인 지급 요청은 사유를 변경할 수 없습니다. 같은 요청으로 재시도해 주세요.");
      return;
    }
    const attempt = grantAttempt?.userId === user.id
      ? grantAttempt
      : { userId: user.id, sourceId: crypto.randomUUID(), reason };
    if (!grantAttempt || grantAttempt.userId !== user.id) {
      setGrantAttempt(attempt);
      try {
        window.sessionStorage.setItem(`dayo_admin_grant_pending:${user.id}`, JSON.stringify(attempt));
      } catch {
        /* Keep the same event ID for retries while this drawer remains open. */
      }
    }

    grantInFlightRef.current = true;
    setBusyTickets(true);
    setNotice("");
    try {
      const result = await grantAdminTickets(user, 1, reason, attempt.sourceId);
      setTicketCount(result.ticketCount);
      onTicketChange?.(user.id, result.ticketCount);
      if (!result.duplicate) {
        setLedgers((cur) => [
          {
            id: attempt.sourceId,
            created_at: new Date().toISOString(),
            delta: 1,
            reason: "관리자 티켓 지급 (사유 미저장)",
            source: "admin_grant",
            balance_after: result.ticketCount,
          },
          ...cur,
        ]);
      }
      try {
        window.sessionStorage.removeItem(`dayo_admin_grant_pending:${user.id}`);
      } catch {
        /* A successful grant is already idempotent on the server. */
      }
      setGrantAttempt(null);
      setNotice(result.duplicate ? "이미 처리된 보상 지급 요청입니다." : "보상 티켓이 지급되었습니다.");
      setReasonOpen(false);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "티켓 지급에 실패했습니다.");
    } finally {
      grantInFlightRef.current = false;
      setBusyTickets(false);
    }
  }

  async function handleSaveMemo() {
    if (!user || busyMemo) return;
    setBusyMemo(true);
    setMemoNotice("");
    setMemoError("");
    try {
      const savedMemo = await saveAdminMemo(user, memo);
      setMemo(savedMemo);
      const success = "✅ CS 특이사항 메모가 저장되었습니다.";
      setMemoNotice(success);
      window.setTimeout(() => setMemoNotice((current) => current === success ? "" : current), 4500);
    } catch (err) {
      const message = err instanceof Error ? err.message : "CS 메모 저장에 실패했습니다.";
      setMemoError(message);
      window.alert(`CS 메모를 저장하지 못했습니다.\n${message}`);
    } finally {
      setBusyMemo(false);
    }
  }

  async function handleWelcomeEmailTest() {
    const email = String(user?.email || "").trim();
    if (!email || busyWelcome) {
      if (!email) window.alert("웰컴 이메일을 발송할 회원 이메일이 없습니다.");
      return;
    }
    setBusyWelcome(true);
    setNotice("");
    try {
      const response = await fetch("/api/send-welcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, nickname: displayName || "회원" }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || "웰컴 이메일 발송에 실패했습니다.");
      setNotice(`웰컴 이메일을 ${email} 주소로 발송했습니다.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "웰컴 이메일 발송에 실패했습니다.";
      setNotice(message);
      window.alert(message);
    } finally {
      setBusyWelcome(false);
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!user?.email || busyWelcome}
              onClick={() => void handleWelcomeEmailTest()}
            >
              <Mail className="mr-1.5 h-3.5 w-3.5" />
              {busyWelcome ? "발송 중…" : "웰컴 이메일 테스트 발송"}
            </Button>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="닫기">
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {memoNotice ? <div className="fixed right-6 top-6 z-[100] rounded-xl bg-emerald-600 px-5 py-4 text-sm font-semibold text-white shadow-xl">{memoNotice}</div> : null}
          {memoError ? <p className="mb-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{memoError}</p> : null}
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
                    <Button size="sm" variant="outline" disabled title="티켓 lot 차감 전환 후 사용할 수 있어요">
                      <Minus className="mr-1 h-3.5 w-3.5" />-1 수동 차감 준비 중
                    </Button>
                    <Button size="sm" variant="coral" disabled={busyTickets || !user} onClick={openReasonModal}>
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
                                {order.amount === 19900 && Number(order.ticket_count || 1) === 1
                                  ? "깔끔한 1회 티켓"
                                  : order.product_name || "이용권 패키지"}
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
                        onClick={() =>
                          setSelectedSession({
                            id: session.id,
                            scheduled_at: session.scheduled_at,
                            status: session.status,
                            learnerName: displayName || "학습자",
                            partnerName: session.partner_name || "파트너",
                            learnerId: session.learner_id || user?.user_id || user?.id || null,
                            rating: session.rating,
                            review: session.review,
                          })
                        }
                      >
                        <FileText className="mr-1 h-3.5 w-3.5" />
                        대화록 & AI 리포트 전문 확인
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
            <h3 className="text-lg font-semibold">+1 보상 지급</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {displayName}님에게 티켓 1장을 지급합니다. 지급 후 잔액은 유효한 티켓 기준으로 다시 계산됩니다.
            </p>
            <div className="mt-3">
              <Label htmlFor="ticket-reason">변동 사유</Label>
              <Textarea
                id="ticket-reason"
                className="mt-1 min-h-[100px]"
                value={reasonText}
                onChange={(e) => setReasonText(e.target.value)}
                disabled={!!grantAttempt && grantAttempt.userId === user?.id}
                placeholder="예: 세션 장애 보상"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                현재 지급 사유는 티켓 이력에 저장되지 않습니다. 필요하면 CS 특이사항에 별도로 기록해 주세요.
              </p>
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

      <SessionTranscriptModal
        open={!!selectedSession}
        session={selectedSession}
        onClose={() => setSelectedSession(null)}
      />
    </>
  );
}
