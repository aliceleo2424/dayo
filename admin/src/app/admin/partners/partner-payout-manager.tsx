"use client";
import { ProfileImage } from "@/components/admin/profile-image";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PartnerPayoutDialog } from "@/components/admin/partner-payout-dialog";
import { fetchPartnerPayoutSummaries, payoutStatusLabel, type PayoutSummary } from "@/lib/partner-payouts";
import { fetchPartnerProfiles } from "@/lib/admin-data";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/utils";
import { DataTable, type Column } from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PartnerDetailModal, partnerName, type PartnerProfile } from "@/components/admin/partner-detail-modal";

type PartnerRow = PartnerProfile & {
  average_rating: number;
  available_slots: number;
  total_sessions: number;
  completed_sessions: number;
  month_completed_sessions: number;
  penalty_points: number;
};

const STATUS_META: Record<string, { label: string; variant: "success" | "warning" | "default" }> = {
  active: { label: "🟢 활동중", variant: "success" },
  vacation: { label: "☕ 휴가중", variant: "warning" },
  suspended: { label: "🚫 활동정지", variant: "warning" },
  withdrawn: { label: "📁 탈퇴(기록보존)", variant: "default" },
};

function statusMeta(status?: string | null) {
  return STATUS_META[String(status || "active").toLowerCase()] || STATUS_META.active;
}

function emptyRow(row: PartnerProfile): PartnerRow {
  return {
    ...row,
    average_rating: 0,
    available_slots: 0,
    total_sessions: 0,
    completed_sessions: 0,
    month_completed_sessions: 0,
    penalty_points: 0,
  };
}

function usePartnerRows() {
  const [rows, setRows] = useState<PartnerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const result = await fetchPartnerProfiles();
    if (result.error) {
      setError(result.error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    const profiles = ((result.data || []) as unknown as PartnerProfile[]).map(emptyRow);
    const ids = profiles.map((row) => row.user_id || row.id).filter(Boolean);
    const [bookings, slots] = await Promise.all([
      ids.length
        ? supabase.from("bookings").select("partner_user_id, status, rating, scheduled_at").in("partner_user_id", ids).eq("is_test_session", false)
        : Promise.resolve({ data: [], error: null }),
      ids.length
        ? supabase.from("availability_slots").select("partner_id, status").in("partner_id", ids)
        : Promise.resolve({ data: [], error: null }),
    ]);

    setRows(profiles.map((profile) => {
      const uid = profile.user_id || profile.id;
      const partnerBookings = ((bookings.data || []) as Record<string, unknown>[])
        .filter((row) => String(row.partner_user_id || "") === uid);
      const now = new Date();
      const monthBookings = partnerBookings.filter((row) => {
        if (!row.scheduled_at) return false;
        const date = new Date(String(row.scheduled_at));
        return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
      });
      const monthCompleted = monthBookings.filter((row) => String(row.status) === "completed").length;
      const monthLearnerNoShow = monthBookings.filter((row) => String(row.status) === "learner_noshow").length;
      const monthPartnerNoShow = monthBookings.filter((row) => String(row.status) === "partner_noshow").length;
      const ratings = partnerBookings
        .map((row) => Number(row.rating))
        .filter((value) => Number.isFinite(value) && value > 0);
      return {
        ...profile,
        average_rating: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0,
        available_slots: ((slots.data || []) as Record<string, unknown>[]).filter(
          (row) => String(row.partner_id || "") === uid && String(row.status || "available") === "available"
        ).length,
        total_sessions: partnerBookings.length,
        completed_sessions: partnerBookings.filter((row) => String(row.status) === "completed").length,
        month_completed_sessions: monthCompleted + monthLearnerNoShow,
        penalty_points: monthPartnerNoShow * 10000,
      };
    }));
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);
  return { rows, setRows, loading, error, load };
}

function PartnerEmpty({ message }: { message: string }) {
  return (
    <Card>
      <CardContent className="py-16 text-center">
        <p className="text-lg font-semibold">{message}</p>
      </CardContent>
    </Card>
  );
}

export function PartnerManagementTable() {
  const { rows, setRows, loading, error } = usePartnerRows();
  const [selected, setSelected] = useState<PartnerProfile | null>(null);

  const columns: Column<PartnerRow & Record<string, unknown>>[] = [
    {
      key: "partner_status", header: "상태", sortable: true,
      render: (row) => {
        const meta = statusMeta(String(row.partner_status || "active"));
        return <Badge variant={meta.variant}>{meta.label}</Badge>;
      },
    },
    {
      key: "nickname", header: "파트너명 / 이메일", sortable: true,
      render: (row) => (
        <div className="flex items-center gap-2">
          <ProfileImage avatarUrl={row.avatar_url} size={40} /><div>
          <p className="font-semibold">{partnerName(row as PartnerProfile)}</p>
          <p className="text-xs text-muted-foreground">{String(row.email || "이메일 미등록")}</p>
        </div></div>
      ),
    },
    { key: "nationality", header: "국적 / 출신", render: (row) => String(row.nationality || "미등록") },
    { key: "languages", header: "담당 언어", render: (row) => String(row.languages || "미등록") },
    {
      key: "average_rating", header: "평균 평점", sortable: true,
      render: (row) => Number(row.average_rating || 0) > 0 ? `★ ${Number(row.average_rating).toFixed(1)}` : "—",
    },
    { key: "available_slots", header: "가용 슬롯", sortable: true, render: (row) => `${Number(row.available_slots || 0)}개` },
    { key: "total_sessions", header: "누적 세션", sortable: true, render: (row) => `${Number(row.total_sessions || 0)}회` },
    {
      key: "manage", header: "관리",
      render: (row) => <Button size="sm" variant="outline" onClick={() => setSelected(row as PartnerProfile)}>상세 관제</Button>,
    },
  ];

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">계정 상태, 세션 품질, 슬롯과 CS 이력을 파트너 단위로 관리합니다.</p>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {loading ? <div className="h-40 animate-pulse rounded-xl bg-muted" /> : !rows.length ? (
        <PartnerEmpty message="등록된 파트너가 없습니다." />
      ) : (
        <DataTable
          data={rows as (PartnerRow & Record<string, unknown>)[]}
          columns={columns}
          searchKeys={["nickname", "user_name", "email", "nationality", "languages", "partner_status"]}
          exportFilename="partners-management.csv"
          onRowClick={(row) => setSelected(row as PartnerProfile)}
        />
      )}
      <PartnerDetailModal
        partner={selected}
        open={!!selected}
        onOpenChange={(open) => { if (!open) setSelected(null); }}
        onSettled={(id, next) => {
          setRows((prev) => prev.map((row) => row.id === id ? { ...row, point_balance: next } : row));
          setSelected((current) => current?.id === id ? { ...current, point_balance: next } : current);
        }}
        onUpdated={(next) => {
          setRows((prev) => prev.map((row) => row.id === next.id ? { ...row, ...next } : row));
          setSelected((current) => current?.id === next.id ? next : current);
        }}
      />
    </div>
  );
}

export function PartnerSettlementTable() {
  const [rows, setRows] = useState<PayoutSummary[]>([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setRows(await fetchPartnerPayoutSummaries()); }
    catch (err) { setRows([]); setError(err instanceof Error ? err.message : "정산 조회 실패"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const summary = useMemo(() => ({
    pending: rows.filter(row => row.can_record).reduce((sum,row) => sum + row.amount, 0),
    settled: rows.reduce((sum,row) => sum + row.paid_total, 0),
    unresolved: rows.filter(row => row.status === "unpaid" || row.status === "needs_review").length,
  }), [rows]);
  const columns: Column<PayoutSummary & Record<string, unknown>>[] = [
    { key: "partner_name", header: "파트너명", sortable: true },
    { key: "session_count", header: "미지급 완료 세션", render: row => `${row.session_count}회` },
    { key: "point_balance", header: "미지급 포인트", render: row => `${row.point_balance.toLocaleString("ko-KR")} P` },
    { key: "offset_amount", header: "반영된 패널티 상계", render: row => formatCurrency(row.offset_amount) },
    { key: "amount", header: "최종 지급액", render: row => row.status === "needs_review" ? "확인 필요" : <strong>{formatCurrency(row.amount)}</strong> },
    { key: "status", header: "정산 상태", render: row => <Badge variant={row.status === "paid" ? "success" : row.status === "no_rewards" ? "default" : "warning"}>{payoutStatusLabel(row.status)}</Badge> },
    { key: "paid_total", header: "누적 지급액", render: row => formatCurrency(row.paid_total) },
    { key: "record", header: "처리 / 이력", render: row => <Button size="sm" variant="outline" onClick={() => setSelectedId(row.partner_user_id)}>정산 내역 / 지급 기록</Button> },
  ];
  return <div className="space-y-5">
    <section className="grid gap-4 md:grid-cols-3">
      {[["미지급 보상 총 지급 예정액",formatCurrency(summary.pending)],["누적 지급 기록액",formatCurrency(summary.settled)],["미처리 / 확인 필요",`${summary.unresolved}건`]].map(([label,value]) => <Card key={label}>
        <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{label}</CardTitle></CardHeader>
        <CardContent><p className="text-2xl font-bold">{value}</p></CardContent></Card>)}
    </section>
    <p className="text-sm text-muted-foreground">미지급 보상 근거와 포인트 잔액을 대조합니다. 실제 지급 후 방법·대상·일시를 기록해 주세요.</p>
    {error ? <div role="alert"><p className="text-sm text-red-600">{error}</p><Button variant="outline" onClick={() => void load()}>다시 불러오기</Button></div> : null}
    {loading ? <div className="h-40 animate-pulse rounded-xl bg-muted"/> : !error && !rows.length ? <PartnerEmpty message="정산 대상 파트너가 없습니다."/> : !error ? <DataTable
      data={rows as (PayoutSummary & Record<string, unknown>)[]} columns={columns}
      searchKeys={["partner_name"]} exportFilename="partner-payout-summary.csv"/> : null}
    <PartnerPayoutDialog partnerId={selectedId} onClose={() => setSelectedId(null)} onRecorded={() => { void load(); }}/>
  </div>;
}

/** Backward-compatible export. */
export const PartnerPayoutManager = PartnerSettlementTable;
