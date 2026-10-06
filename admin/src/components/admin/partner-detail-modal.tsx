"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { adminProfiles, bookingStatusLabel, detectMemberProvider, formatSessionDateTime, type AuthProvider, type MemberIdentity, type SessionTranscriptContext } from "@/lib/admin-data";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PartnerProfileCompletionSummary } from "@/components/admin/partner-profile-completion-summary";
import { ProviderBadge } from "@/components/admin/provider-badge";
import { SessionTranscriptModal } from "@/components/admin/SessionTranscriptModal";
import { PartnerAvailabilitySection } from "@/components/admin/partner-availability";

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
  learner_email: string | null;
  learner_provider: AuthProvider;
  learner_profile_found: boolean;
  scheduled_at: string | null;
  status: string | null;
  rating: number | null;
  review: string | null;
};

type SessionLearner = { name: string; email: string | null; provider: AuthProvider };

async function loadSessionLearners(learnerIds: string[]) {
  const identities = new Map<string, SessionLearner>();
  if (!learnerIds.length) return { identities, failed: false };
  const result = await adminProfiles()
    .select("id, user_id, nickname, user_name, email, provider")
    .or(`id.in.(${learnerIds.join(",")}),user_id.in.(${learnerIds.join(",")})`);
  if (result.error) return { identities, failed: true };
  const rows = (result.data || []) as (MemberIdentity & { user_id?: string | null })[];
  for (const learnerId of learnerIds) {
    // The booking's exact profile id takes precedence over a legacy user_id alias.
    const row = rows.find((item) => item.id === learnerId)
      || rows.find((item) => item.user_id === learnerId);
    if (!row) continue;
    const email = row.email == null ? null : row.email.trim();
    identities.set(learnerId, {
      name: row.nickname?.trim() || row.user_name?.trim() || email || "이름 미등록",
      email,
      provider: detectMemberProvider(row),
    });
  }
  return { identities, failed: false };
}

function SessionLearnerIdentity({ session }: { session: PartnerSession }) {
  return (
    <div className="mt-1 space-y-1 text-sm">
      <p><span className="text-xs text-muted-foreground">상대 유저 · </span>{session.learner_name}</p>
      {session.learner_profile_found ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="break-all text-muted-foreground">{session.learner_email === null ? "이메일 미등록" : session.learner_email || "이메일 정보 없음"}</span>
          {session.learner_provider !== "unknown" ? <ProviderBadge provider={session.learner_provider} /> : null}
        </div>
      ) : null}
    </div>
  );
}

type LedgerEntry = {
  id: string;
  created_at: string | null;
  label: string;
  delta: number;
  balance_after: number | null;
  note: string;
};

const CONVERSATION_LANGUAGES = [
  { id: "en", label: "영어" },
  { id: "es", label: "스페인어" },
  { id: "fr", label: "프랑스어" },
  { id: "ko", label: "한국어" },
] as const;

const KOREAN_SUPPORT_LEVELS = [
  { id: "", label: "미설정" },
  { id: "none", label: "도움 어려움" },
  { id: "basic", label: "기초적인 도움 가능" },
  { id: "conversational", label: "간단한 설명 가능" },
  { id: "fluent", label: "원활한 설명 가능" },
] as const;

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
  if (raw === "learner_noshow") return { label: "유저 노쇼", variant: "warning" as const, detail: "+6,000P 파트너 활동비 100% 보전 지급", delta: 6000 };
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
  const [capabilityLanguages, setCapabilityLanguages] = useState<string[]>([]);
  const [koreanSupportLevel, setKoreanSupportLevel] = useState("");
  const [capabilityLoadedId, setCapabilityLoadedId] = useState<string | null>(null);
  const [capabilityLoading, setCapabilityLoading] = useState(false);
  const [capabilitySaving, setCapabilitySaving] = useState(false);
  const [capabilityError, setCapabilityError] = useState("");
  const [capabilityNotice, setCapabilityNotice] = useState("");
  const capabilityEpochRef = useRef(0);
  const capabilitySaveRef = useRef(new Set<string>());

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
      const { identities: learnerMap, failed: learnerLookupFailed } = await loadSessionLearners(learnerIds);

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
        );
        return {
          id: String(row.id || ""),
          learner_id: learnerId || null,
          learner_name: learner?.name || (learnerLookupFailed ? "유저 정보를 불러오지 못했습니다." : "유저 정보 없음"),
          learner_email: learner?.email ?? null,
          learner_provider: learner?.provider || "unknown",
          learner_profile_found: Boolean(learner),
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

  useEffect(() => {
    const epoch = ++capabilityEpochRef.current;
    if (!open || !partner || partner.role !== "partner") return;
    const partnerId = partner.id;
    setCapabilityLanguages([]);
    setKoreanSupportLevel("");
    setCapabilityLoadedId(null);
    setCapabilityLoading(true);
    setCapabilitySaving(false);
    setCapabilityError("");
    setCapabilityNotice("");
    void (async () => {
      try {
        const { data, error } = await supabase.rpc("get_admin_partner_capabilities", { p_partner_id: partnerId });
        if (capabilityEpochRef.current !== epoch) return;
        if (error) throw error;
        const result = data as { success?: boolean; conversation_languages?: unknown; korean_support_level?: unknown } | null;
        if (!result?.success || !Array.isArray(result.conversation_languages)) {
          throw new Error("파트너 예약 정보를 확인하지 못했습니다.");
        }
        setCapabilityLanguages(result.conversation_languages.filter((id): id is string =>
          typeof id === "string" && CONVERSATION_LANGUAGES.some((language) => language.id === id)));
        setKoreanSupportLevel(typeof result.korean_support_level === "string" ? result.korean_support_level : "");
        setCapabilityLoadedId(partnerId);
      } catch (error) {
        if (capabilityEpochRef.current === epoch) {
          setCapabilityError(error instanceof Error ? error.message : "파트너 예약 정보를 불러오지 못했습니다.");
        }
      } finally {
        if (capabilityEpochRef.current === epoch) setCapabilityLoading(false);
      }
    })();
    return () => { capabilityEpochRef.current += 1; };
  }, [open, partner?.id, partner?.role]);

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
    if (!partner || typeof partner.partner_status !== "string" || nextStatus === partner.partner_status) return;
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

  async function saveCapabilities() {
    if (!partner || capabilityLoadedId !== partner.id || capabilityLoading || capabilitySaveRef.current.has(partner.id)) return;
    if (!capabilityLanguages.length) {
      setCapabilityError("대화 가능 언어를 하나 이상 선택해 주세요.");
      return;
    }
    const partnerId = partner.id;
    const epoch = capabilityEpochRef.current;
    capabilitySaveRef.current.add(partnerId);
    setCapabilitySaving(true);
    setCapabilityError("");
    setCapabilityNotice("");
    try {
      const { data, error } = await supabase.rpc("admin_set_partner_capabilities", {
        p_partner_id: partnerId,
        p_conversation_languages: capabilityLanguages,
        p_korean_support_level: koreanSupportLevel || null,
      });
      if (error) throw error;
      if (!(data as { success?: boolean } | null)?.success) throw new Error("파트너 예약 정보 저장 결과를 확인하지 못했습니다.");
      if (capabilityEpochRef.current === epoch) setCapabilityNotice("파트너 예약 정보가 저장되었습니다.");
    } catch (error) {
      if (capabilityEpochRef.current === epoch) {
        setCapabilityError(error instanceof Error ? error.message : "파트너 예약 정보 저장에 실패했습니다.");
      }
    } finally {
      capabilitySaveRef.current.delete(partnerId);
      if (capabilityEpochRef.current === epoch) setCapabilitySaving(false);
    }
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
            <div className="min-w-0 space-y-5">
              {partner.role === "partner" && <PartnerProfileCompletionSummary key={partner.id} partnerId={partner.id} />}
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
                    className="mt-1 block max-w-full rounded-md border bg-white px-3 py-2 text-sm text-foreground"
                    value={String(partner.partner_status || "")}
                    disabled={busy || typeof partner.partner_status !== "string"}
                    onChange={(event) => void updateStatus(event.target.value)}
                  >
                    {typeof partner.partner_status !== "string" && <option value="">승인 역할 기준 · 별도 활동 상태 없음</option>}
                    <option value="active">🟢 활동중 (Active)</option>
                    <option value="vacation">☕ 휴가중 (Vacation)</option>
                    <option value="suspended">🚫 활동정지 (Suspended)</option>
                    <option value="withdrawn">📁 탈퇴 (Withdrawn)</option>
                  </select>
                </label>
              </section>

              {partner.role === "partner" ? <section className="space-y-3 rounded-xl border bg-white p-4">
                <div>
                  <h3 className="text-sm font-semibold">예약용 파트너 정보</h3>
                  <p className="mt-1 text-xs text-muted-foreground">신청 내용을 확인한 운영자가 설정합니다. 기존 자유 텍스트 담당 언어와 별개입니다.</p>
                </div>
                {capabilityLoading ? <p className="text-xs text-muted-foreground">예약 정보를 불러오는 중…</p> : null}
                {!capabilityLoading && capabilityLoadedId === partner.id ? (
                  <>
                    {(!capabilityLanguages.length || !koreanSupportLevel) ? (
                      <p className="text-xs font-medium text-amber-700">예약 정보 미설정 · 대화 가능 언어와 한국어 도움 수준을 확인해 주세요.</p>
                    ) : null}
                    <fieldset disabled={capabilitySaving}>
                      <legend className="mb-2 text-xs font-semibold">대화 가능 언어</legend>
                      <div className="flex flex-wrap gap-3">
                        {CONVERSATION_LANGUAGES.map((language) => (
                          <label key={language.id} className="flex items-center gap-1.5 text-sm">
                            <input type="checkbox" checked={capabilityLanguages.includes(language.id)} onChange={(event) => {
                              setCapabilityLanguages((current) => event.target.checked
                                ? [...current, language.id]
                                : current.filter((id) => id !== language.id));
                              setCapabilityNotice("");
                            }} />
                            {language.label}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <label className="block text-xs font-semibold">
                      한국어 도움 수준
                      <select className="mt-2 block w-full max-w-xs rounded-md border bg-white px-3 py-2 text-sm font-normal" value={koreanSupportLevel} disabled={capabilitySaving} onChange={(event) => { setKoreanSupportLevel(event.target.value); setCapabilityNotice(""); }}>
                        {KOREAN_SUPPORT_LEVELS.map((level) => <option key={level.id} value={level.id}>{level.label}</option>)}
                      </select>
                    </label>
                    <p className="text-xs text-muted-foreground">외국어 대화 중 사용자가 막혔을 때 한국어로 어느 정도 도울 수 있는지 설정합니다.</p>
                    <Button type="button" size="sm" variant="outline" disabled={capabilitySaving} onClick={() => void saveCapabilities()}>{capabilitySaving ? "저장 중…" : "예약 정보 저장"}</Button>
                  </>
                ) : null}
                {capabilityError ? <p className="text-xs text-red-700" role="alert">{capabilityError}</p> : null}
                {capabilityNotice ? <p className="text-xs text-emerald-700" role="status">{capabilityNotice}</p> : null}
              </section> : null}

              {partner.role === "partner" && <PartnerAvailabilitySection key={`availability:${partner.id}`} partnerId={partner.id} name={partner.nickname || partner.user_name || "DayO Partner"} />}

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
                  <TabsTrigger value="reviews">⭐ 유저 리뷰</TabsTrigger>
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
                            <SessionLearnerIdentity session={session} />
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
                  )) : <p className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">등록된 유저 리뷰가 없습니다.</p>}
                </TabsContent>

                <TabsContent value="tax" className="mt-4">
                  <Card>
                    <CardContent className="grid gap-4 pt-6 text-sm sm:grid-cols-2">
                      <p><span className="text-muted-foreground">예금주 실명</span><br /><strong>{dash(partner.account_holder)}</strong></p>
                      <p><span className="text-muted-foreground">거래 은행</span><br /><strong>{dash(partner.bank_name)}</strong></p>
                      <p><span className="text-muted-foreground">계좌번호</span><br /><strong>{maskAccount(partner.bank_account)}</strong></p>
                      <p><span className="text-muted-foreground">주민/외국인등록번호</span><br /><strong>{maskIdentity(partner.identity_number_masked)}</strong></p>
                      <div><span className="text-muted-foreground">신분증 등록</span><br /><Badge variant={partner.id_document_url ? "success" : "warning"}>{partner.id_document_url ? "등록 완료" : "미등록"}</Badge></div>
                      <div><span className="text-muted-foreground">통장사본 등록</span><br /><Badge variant={partner.bank_document_url ? "success" : "warning"}>{partner.bank_document_url ? "등록 완료" : "미등록"}</Badge></div>
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
