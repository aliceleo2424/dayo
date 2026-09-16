"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  final_payout: number;
  settled_total: number;
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

function bankLine(row: PartnerProfile) {
  const account = String(row.bank_account || "").trim();
  const masked = account.length > 4 ? `${account.slice(0, 3)}-****-${account.slice(-3)}` : account;
  return [row.bank_name, masked].filter(Boolean).join(" · ") || "계좌 미등록";
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
    final_payout: 0,
    settled_total: 0,
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
    const [bookings, slots, settlements] = await Promise.all([
      ids.length
        ? supabase.from("bookings").select("partner_user_id, status, rating, scheduled_at").in("partner_user_id", ids)
        : Promise.resolve({ data: [], error: null }),
      ids.length
        ? supabase.from("availability_slots").select("partner_id, status").in("partner_id", ids)
        : Promise.resolve({ data: [], error: null }),
      supabase.from("settlement_logs").select("partner_user_id, partner_profile_id, amount_krw"),
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
      const calculatedPayout = Math.max(0, (monthCompleted + monthLearnerNoShow) * 6000 - monthPartnerNoShow * 10000);
      const ratings = partnerBookings
        .map((row) => Number(row.rating))
        .filter((value) => Number.isFinite(value) && value > 0);
      const settled = ((settlements.data || []) as Record<string, unknown>[])
        .filter((row) => String(row.partner_user_id || "") === uid || String(row.partner_profile_id || "") === profile.id)
        .reduce((sum, row) => sum + Number(row.amount_krw || 0), 0);
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
        final_payout: calculatedPayout || Math.max(0, Number(profile.point_balance || 0)),
        settled_total: settled,
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
        <div>
          <p className="font-semibold">{partnerName(row as PartnerProfile)}</p>
          <p className="text-xs text-muted-foreground">{String(row.email || "이메일 미등록")}</p>
        </div>
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
  const { rows, setRows, loading, error } = usePartnerRows();
  const [busyId, setBusyId] = useState("");
  const summary = useMemo(() => ({
    pending: rows.reduce((sum, row) => sum + Number(row.final_payout || 0), 0),
    settled: rows.reduce((sum, row) => sum + Number(row.settled_total || 0), 0),
    unresolved: rows.filter((row) => Number(row.final_payout || 0) > 0).length,
  }), [rows]);

  async function settle(row: PartnerRow) {
    if (!window.confirm(`${partnerName(row)} 파트너의 ${formatCurrency(Number(row.point_balance || 0))} 송금을 완료 처리할까요?`)) return;
    setBusyId(row.id);
    const uid = row.user_id || row.id;
    const rpc = await supabase.rpc("settle_partner_payout", { p_partner_user_id: uid });
    const data = rpc.data as { success?: boolean; message?: string } | null;
    if (rpc.error || !data?.success) {
      window.alert(rpc.error?.message || data?.message || "정산 처리에 실패했습니다.");
    } else {
      setRows((prev) => prev.map((item) => item.id === row.id
        ? { ...item, settled_total: item.settled_total + Number(item.point_balance || 0), point_balance: 0, final_payout: 0 }
        : item));
    }
    setBusyId("");
  }

  const columns: Column<PartnerRow & Record<string, unknown>>[] = [
    { key: "nickname", header: "파트너명", sortable: true, render: (row) => partnerName(row as PartnerProfile) },
    { key: "bank", header: "정산 은행 / 계좌", render: (row) => bankLine(row as PartnerProfile) },
    { key: "month_completed_sessions", header: "완료 세션수", sortable: true, render: (row) => `${Number(row.month_completed_sessions || 0)}회` },
    { key: "point_balance", header: "적립 포인트", sortable: true, render: (row) => `${Number(row.point_balance || 0).toLocaleString("ko-KR")} P` },
    { key: "penalty_points", header: "패널티 차감", sortable: true, render: (row) => <span className="text-rose-600">-{Number(row.penalty_points || 0).toLocaleString("ko-KR")} P</span> },
    { key: "final_payout", header: "최종 지급액", render: (row) => <strong>{formatCurrency(Number(row.final_payout || 0))}</strong> },
    {
      key: "status", header: "정산 상태",
      render: (row) => Number(row.final_payout || 0) > 0
        ? <Badge variant="warning">대기</Badge>
        : <Badge variant="success">지급완료</Badge>,
    },
    {
      key: "settle", header: "처리",
      render: (row) => (
        <Button
          size="sm"
          variant="coral"
          disabled={busyId === row.id || Number(row.point_balance || 0) <= 0}
          onClick={() => void settle(row as PartnerRow)}
        >
          송금 완료 처리
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <section className="grid gap-4 md:grid-cols-3">
        {[
          ["이번 달 총 지급 예정액", formatCurrency(summary.pending)],
          ["누적 정산 완료액", formatCurrency(summary.settled)],
          ["미처리 건수", `${summary.unresolved}건`],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{label}</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">{value}</p></CardContent>
          </Card>
        ))}
      </section>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {loading ? <div className="h-40 animate-pulse rounded-xl bg-muted" /> : !rows.length ? (
        <PartnerEmpty message="정산 대상 파트너가 없습니다." />
      ) : (
        <DataTable
          data={rows as (PartnerRow & Record<string, unknown>)[]}
          columns={columns}
          searchKeys={["nickname", "user_name", "email", "bank_name", "account_holder"]}
          exportFilename="partner-settlements.csv"
        />
      )}
    </div>
  );
}

/** Backward-compatible export. */
export const PartnerPayoutManager = PartnerSettlementTable;
