"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { bookingStatusLabel, formatSessionDateTime, type SessionTranscriptContext } from "@/lib/admin-data";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SessionTranscriptModal } from "@/components/admin/SessionTranscriptModal";

export type PartnerProfile = {
  id: string;
  user_id: string | null;
  nickname: string | null;
  user_name: string | null;
  email: string | null;
  role: string | null;
  partner_status?: string | null;
  nationality?: string | null;
  visa_type: string | null;
  languages: string | null;
  bank_name: string | null;
  bank_account: string | null;
  account_holder: string | null;
  identity_number_masked?: string | null;
  id_document_url?: string | null;
  bank_document_url?: string | null;
  point_balance: number | null;
  created_at: string | null;
};

type PartnerSession = {
  id: string;
  learner_id: string | null;
  learner_name: string;
  learner_email: string;
  scheduled_at: string | null;
  status: string | null;
  rating: number | null;
  review: string | null;
};

type LedgerEntry = {
  id: string;
  created_at: string | null;
  label: string;
  delta: number;
  balance_after: number | null;
  note: string;
};

function dash(value: string | null | undefined) {
  return String(value || "").trim() || "미등록";
}

function partnerName(row: PartnerProfile) {
  return dash(row.nickname || row.user_name || row.email);
}

function maskIdentity(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return "미등록";
  if (raw.includes("*")) return raw;
  return raw.length > 6 ? `${raw.slice(0, 6)}-*******` : "******-*******";
}

function maskAccount(value?: string | null) {
  const raw = String(value || "").trim();
  return raw.length > 6 ? `${raw.slice(0, 3)}-****-${raw.slice(-3)}` : raw || "미등록";
}

function statusDetail(status?: string | null) {
  const raw = String(status || "").toLowerCase();
  if (raw === "learner_noshow") return { label: "학습자 노쇼", variant: "warning" as const, detail: "+6,000P 파트너 활동비 100% 보전 지급", delta: 6000 };
  if (raw === "partner_noshow") return { label: "파트너 노쇼", variant: "warning" as const, detail: "패널티 -10,000P 차감 및 세션비 미지급", delta: -10000 };
  if (raw === "completed") return { label: "정상 완료", variant: "success" as const, detail: "25분 대화 완료 (+6,000P 적립)", delta: 6000 };
  if (raw === "cancelled" || raw === "canceled") return { label: "취소", variant: "default" as const, detail: "규정 내 취소", delta: 0 };
  const base = bookingStatusLabel(raw);
  return { ...base, detail: "예약된 세션", delta: 0 };
}

export function PartnerDetailModal({
  partner,
  open,
  onOpenChange,
  onSettled,
  onUpdated,
}: {
  partner: PartnerProfile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSettled?: (partnerId: string, nextBalance: number) => void;
  onUpdated?: (next: PartnerProfile) => void;
}) {
  const [sessions, setSessions] = useState<PartnerSession[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [settledTotal, setSettledTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedSession, setSelectedSession] = useState<SessionTranscriptContext | null>(null);

  const points = Number(partner?.point_balance || 0);

  useEffect(() => {
    if (!open || !partner) return;
    const current = partner;
    let cancelled = false;
    setLoading(true);
    setMessage("");
    setSessions([]);
    setLedger([]);

    void (async () => {
      const uid = current.user_id || current.id;
      const bookingSelects = [
        "id, learner_id, scheduled_at, status, rating, review",
        "id, learner_id, scheduled_at, status, rating",
        "id, learner_id, scheduled_at, status",
        "*",
      ];
      let bookingRows: Record<string, unknown>[] = [];
      for (const columns of bookingSelects) {
        const result = await supabase.from("bookings").select(columns).eq("partner_user_id", uid).order("scheduled_at", { ascending: false });
        if (!result.error) {
          bookingRows = (result.data || []) as unknown as Record<string, unknown>[];
          break;
        }
      }

      const learnerIds = Array.from(new Set(bookingRows.map((row) => String(row.learner_id || "")).filter(Boolean)));
      const learnerMap = new Map<string, { name: string; email: string }>();
      if (learnerIds.length) {
        const learners = await supabase.from("profiles").select("user_id, nickname, user_name, email").in("user_id", learnerIds);
        for (const row of (learners.data || []) as Record<string, unknown>[]) {
          const id = String(row.user_id || "");
          learnerMap.set(id, {
            name: String(row.nickname || row.user_name || row.email || "학습자"),
            email: String(row.email || "이메일 미등록"),
          });
        }
      }

      const reportsResult = await supabase
        .from("session_reports")
        .select("*")
        .eq("partner_user_id", uid)
        .order("created_at", { ascending: false });
      const reportRows = (reportsResult.data || []) as unknown as Record<string, unknown>[];

      const sessionRows: PartnerSession[] = bookingRows.map((row) => {
        const learnerId = String(row.learner_id || "");
        const learner = learnerMap.get(learnerId);
        const report = reportRows.find((item) =>
          String(item.booking_id || "") === String(row.id || "")
        ) || reportRows.find((item) =>
          learnerId && String(item.learner_id || "") === learnerId
        );
        return {
          id: String(row.id || ""),
          learner_id: learnerId || null,
          learner_name: learner?.name || "학습자",
          learner_email: learner?.email || "이메일 미등록",
          scheduled_at: (row.scheduled_at as string | null) || null,
          status: (row.status as string | null) || null,
          rating: row.rating == null
            ? report?.rating == null ? null : Number(report.rating)
            : Number(row.rating),
          review: String(
            row.review || row.feedback || row.comment ||
            report?.review || report?.user_review || ""
          ).trim() || null,
        };
      });

      const [credits, settlements] = await Promise.all([
        supabase.from("credit_ledgers").select("*").eq("user_id", uid).order("created_at", { ascending: false }).limit(100),
        supabase.from("settlement_logs").select("*").or(`partner_user_id.eq.${uid},partner_profile_id.eq.${current.id}`).order("created_at", { ascending: false }),
      ]);
      const creditRows = ((credits.data || []) as Record<string, unknown>[]).map((row) => ({
        id: String(row.id || ""),
        created_at: (row.created_at as string | null) || null,
        label: String(row.source || "포인트 변동"),
        delta: Number(row.delta || 0),
        balance_after: row.balance_after == null ? null : Number(row.balance_after),
        note: String(row.reason || "메모 없음"),
      }));
      const settlementRows = ((settlements.data || []) as Record<string, unknown>[]).map((row) => ({
        id: String(row.id || ""),
        created_at: (row.created_at as string | null) || null,
        label: "정산 송금 완료",
        delta: -Math.abs(Number(row.points_settled || 0)),
        balance_after: 0,
        note: String(row.note || "계좌 입금 완료"),
      }));

      if (!cancelled) {
        setSessions(sessionRows);
        setLedger([...creditRows, ...settlementRows].sort((a, b) =>
          new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
        ));
        setSettledTotal(((settlements.data || []) as Record<string, unknown>[]).reduce((sum, row) => sum + Number(row.amount_krw || 0), 0));
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [open, partner]);

  const metrics = useMemo(() => {
    const now = new Date();
    const thisMonth = sessions.filter((session) => {
      if (!session.scheduled_at) return false;
      const date = new Date(session.scheduled_at);
      return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
    });
    const pending = thisMonth.reduce((sum, session) => sum + statusDetail(session.status).delta, 0);
    const penalties = sessions.filter((session) => String(session.status) === "partner_noshow");
    const ratings = sessions.map((session) => session.rating).filter((value): value is number => value != null && value > 0);
    return {
      pending: Math.max(0, pending),
      penaltyTotal: penalties.length * 10000,
      penaltyCount: penalties.length,
      avgRating: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null,
      ratingCount: ratings.length,
    };
  }, [sessions]);

  async function updateStatus(nextStatus: string) {
    if (!partner || nextStatus === String(partner.partner_status || "active")) return;
    const labels: Record<string, string> = { active: "활동중", vacation: "휴가중", suspended: "활동정지", withdrawn: "탈퇴(기록보존)" };
    if (!window.confirm(`${partnerName(partner)} 파트너 상태를 '${labels[nextStatus]}'(으)로 변경할까요?`)) return;
    setBusy(true);
    const { error } = await supabase.from("profiles").update({
      partner_status: nextStatus,
      updated_at: new Date().toISOString(),
    }).eq("id", partner.id);
    setBusy(false);
    if (error) {
      setMessage(error.message || "상태 변경에 실패했습니다.");
      return;
    }
    const next = { ...partner, partner_status: nextStatus };
    onUpdated?.(next);
    setMessage(nextStatus === "withdrawn"
      ? "탈퇴 상태로 보존했습니다. 세션·정산·리포트 데이터는 삭제되지 않습니다."
      : "파트너 상태가 변경되었습니다.");
  }

  async function settle() {
    if (!partner || points <= 0) return;
    if (!window.confirm(`${formatCurrency(points)} 송금을 완료 처리할까요?`)) return;
    setBusy(true);
    const uid = partner.user_id || partner.id;
    const rpc = await supabase.rpc("settle_partner_payout", { p_partner_user_id: uid });
    const data = rpc.data as { success?: boolean; message?: string } | null;
    setBusy(false);
    if (rpc.error || !data?.success) {
      setMessage(rpc.error?.message || data?.message || "정산 처리에 실패했습니다.");
      return;
    }
    setSettledTotal((total) => total + points);
    onSettled?.(partner.id, 0);
    setMessage(data.message || "정산 송금 완료 처리되었습니다.");
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent id="partner-detail-modal" className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{partner ? `${partnerName(partner)} 파트너 마스터 관제` : "파트너 상세 관제"}</DialogTitle>
          </DialogHeader>
          {partner && (
            <div className="space-y-5">
              <section className="grid gap-4 rounded-xl border bg-[#FAFAF9] p-4 sm:grid-cols-[1fr_auto]">
                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  <p><span className="text-muted-foreground">이메일</span><br />{dash(partner.email)}</p>
                  <p><span className="text-muted-foreground">가입일</span><br />{partner.created_at ? formatDate(partner.created_at) : "미등록"}</p>
                  <p><span className="text-muted-foreground">국적 / 출신</span><br />{dash(partner.nationality)}</p>
                  <p><span className="text-muted-foreground">비자 정보</span><br />{dash(partner.visa_type)}</p>
                </div>
                <label className="text-xs font-semibold text-muted-foreground">
                  상태 변경
                  <select
                    className="mt-1 block rounded-md border bg-white px-3 py-2 text-sm text-foreground"
                    value={String(partner.partner_status || "active")}
                    disabled={busy}
                    onChange={(event) => void updateStatus(event.target.value)}
                  >
                    <option value="active">🟢 활동중 (Active)</option>
                    <option value="vacation">☕ 휴가중 (Vacation)</option>
                    <option value="suspended">🚫 활동정지 (Suspended)</option>
                    <option value="withdrawn">📁 탈퇴 (Withdrawn)</option>
                  </select>
                </label>
              </section>

              <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  ["이번 달 정산 예정액", formatCurrency(metrics.pending)],
                  ["누적 정산 완료 송금액", formatCurrency(settledTotal)],
                  ["누적 패널티 차감액", `-${formatCurrency(metrics.penaltyTotal)} (${metrics.penaltyCount}건)`],
                  ["파트너 평균 평점", metrics.avgRating == null ? "— (0명 평가)" : `★ ${metrics.avgRating.toFixed(1)} (${metrics.ratingCount}명 평가)`],
                ].map(([label, value], index) => (
                  <Card key={label}>
                    <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">{label}</CardTitle></CardHeader>
                    <CardContent><p className={`font-bold ${index === 2 ? "text-rose-600" : ""}`}>{value}</p></CardContent>
                  </Card>
                ))}
              </section>

              {message ? <p className="text-sm text-emerald-700">{message}</p> : null}

              <Tabs defaultValue="sessions">
                <TabsList className="grid h-auto w-full grid-cols-2 gap-1 lg:grid-cols-4">
                  <TabsTrigger value="sessions">☕ 세션 히스토리</TabsTrigger>
                  <TabsTrigger value="ledger">💰 정산·포인트</TabsTrigger>
                  <TabsTrigger value="reviews">⭐ 학생 리뷰</TabsTrigger>
                  <TabsTrigger value="tax">🏦 계좌·세무</TabsTrigger>
                </TabsList>

                <TabsContent value="sessions" className="mt-4 space-y-3">
                  {loading ? <div className="h-32 animate-pulse rounded-xl bg-muted" /> : !sessions.length ? (
                    <p className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">세션 내역이 없습니다.</p>
                  ) : sessions.map((session) => {
                    const detail = statusDetail(session.status);
                    return (
                      <article key={session.id} className="rounded-xl border p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold">{formatSessionDateTime(session.scheduled_at)} <span className="text-xs font-normal text-muted-foreground">(30분 세션)</span></p>
                            <p className="mt-1 text-sm">{session.learner_name} <span className="text-muted-foreground">({session.learner_email})</span></p>
                          </div>
                          <Badge variant={detail.variant}>{detail.label}</Badge>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">{detail.detail}</p>
                        <p className="mt-2 text-sm">{session.rating == null ? "평가 없음" : `★ ${session.rating.toFixed(1)}`}{session.review ? ` (“${session.review}”)` : ""}</p>
                        <Button
                          className="mt-3"
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedSession({
                            id: session.id,
                            scheduled_at: session.scheduled_at,
                            status: session.status,
                            learnerName: session.learner_name,
                            partnerName: partnerName(partner),
                            learnerId: session.learner_id,
                            rating: session.rating,
                            review: session.review,
                          })}
                        >
                          📄 파트너가 작성한 리포트 확인
                        </Button>
                      </article>
                    );
                  })}
                </TabsContent>

                <TabsContent value="ledger" className="mt-4">
                  <div className="mb-3 flex justify-end">
                    <Button variant="coral" disabled={busy || points <= 0} onClick={() => void settle()}>포인트 수동 정산 / 지급 완료</Button>
                  </div>
                  {!ledger.length ? (
                    <p className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">정산 장부 내역이 없습니다.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead><tr className="border-b text-left text-muted-foreground"><th className="p-2">발생일시</th><th className="p-2">내역 구분</th><th className="p-2">변동 포인트</th><th className="p-2">잔여 포인트</th><th className="p-2">메모</th></tr></thead>
                        <tbody>{ledger.map((row) => (
                          <tr key={row.id} className="border-b">
                            <td className="p-2 whitespace-nowrap">{formatSessionDateTime(row.created_at)}</td>
                            <td className="p-2">{row.label}</td>
                            <td className={`p-2 font-semibold ${row.delta < 0 ? "text-rose-600" : "text-emerald-700"}`}>{row.delta > 0 ? "+" : ""}{row.delta.toLocaleString("ko-KR")} P</td>
                            <td className="p-2">{row.balance_after == null ? "—" : `${row.balance_after.toLocaleString("ko-KR")} P`}</td>
                            <td className="p-2 text-muted-foreground">{row.note}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="reviews" className="mt-4 space-y-3">
                  {sessions.filter((session) => session.rating != null || session.review).length ? sessions.filter((session) => session.rating != null || session.review).map((session) => (
                    <article key={session.id} className="rounded-xl border p-4">
                      <div className="flex justify-between gap-3"><strong>{session.learner_name}</strong><span className="font-semibold">★ {Number(session.rating || 0).toFixed(1)}</span></div>
                      <p className="mt-2 text-sm text-muted-foreground">{session.review ? `“${session.review}”` : "후기 코멘트 없음"}</p>
                      <p className="mt-2 text-xs text-muted-foreground">{formatSessionDateTime(session.scheduled_at)}</p>
                    </article>
                  )) : <p className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">등록된 학생 리뷰가 없습니다.</p>}
                </TabsContent>

                <TabsContent value="tax" className="mt-4">
                  <Card>
                    <CardContent className="grid gap-4 pt-6 text-sm sm:grid-cols-2">
                      <p><span className="text-muted-foreground">예금주 실명</span><br /><strong>{dash(partner.account_holder)}</strong></p>
                      <p><span className="text-muted-foreground">거래 은행</span><br /><strong>{dash(partner.bank_name)}</strong></p>
                      <p><span className="text-muted-foreground">계좌번호</span><br /><strong>{maskAccount(partner.bank_account)}</strong></p>
                      <p><span className="text-muted-foreground">주민/외국인등록번호</span><br /><strong>{maskIdentity(partner.identity_number_masked)}</strong></p>
                      <p><span className="text-muted-foreground">신분증 등록</span><br /><Badge variant={partner.id_document_url ? "success" : "warning"}>{partner.id_document_url ? "등록 완료" : "미등록"}</Badge></p>
                      <p><span className="text-muted-foreground">통장사본 등록</span><br /><Badge variant={partner.bank_document_url ? "success" : "warning"}>{partner.bank_document_url ? "등록 완료" : "미등록"}</Badge></p>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <SessionTranscriptModal open={!!selectedSession} session={selectedSession} onClose={() => setSelectedSession(null)} />
    </>
  );
}

export { partnerName };
