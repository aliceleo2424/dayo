"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchPartnerProfiles } from "@/lib/admin-data";
import { formatDate } from "@/lib/utils";
import { DataTable, type Column } from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PartnerDetailModal, partnerName, type PartnerProfile } from "@/components/admin/partner-detail-modal";

const roleLabel: Record<string, string> = {
  partner: "파트너",
  admin: "관리자",
  user: "유저",
};

export function PartnerPayoutManager() {
  const [rows, setRows] = useState<PartnerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<PartnerProfile | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const result = await fetchPartnerProfiles();
    if (result.error) {
      setError(result.error.message);
      setRows([]);
    } else {
      setRows((result.data || []) as PartnerProfile[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const columns: Column<PartnerProfile & Record<string, unknown>>[] = [
    {
      key: "nickname",
      header: "닉네임",
      sortable: true,
      render: (row) => <p className="font-medium">{partnerName(row as PartnerProfile)}</p>,
    },
    {
      key: "email",
      header: "이메일",
      render: (row) => String(row.email || "미등록"),
    },
    {
      key: "point_balance",
      header: "보유 포인트",
      sortable: true,
      render: (row) => `${Number(row.point_balance || 0)} P`,
    },
    {
      key: "created_at",
      header: "가입일",
      sortable: true,
      render: (row) => row.created_at ? formatDate(String(row.created_at)) : "—",
    },
    {
      key: "role",
      header: "권한",
      render: (row) => {
        const role = String(row.role || "");
        return <Badge variant={role === "admin" ? "coral" : "success"}>{roleLabel[role] || role || "—"}</Badge>;
      },
    },
  ];

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading ? (
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
      ) : !rows.length ? (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-lg font-semibold">등록된 파트너가 없습니다. 파트너 등록 지원서를 확인해 주세요.</p>
          </CardContent>
        </Card>
      ) : (
        <DataTable
          data={rows as (PartnerProfile & Record<string, unknown>)[]}
          columns={columns}
          searchKeys={["nickname", "user_name", "email", "role"]}
          exportFilename="partners.csv"
          onRowClick={(row) => setSelected(row as PartnerProfile)}
        />
      )}

      <PartnerDetailModal
        partner={selected}
        open={!!selected}
        onOpenChange={(open) => { if (!open) setSelected(null); }}
        onSettled={(id, next) => {
          setRows((prev) => prev.map((row) => (row.id === id ? { ...row, point_balance: next } : row)));
          setSelected((cur) => (cur && cur.id === id ? { ...cur, point_balance: next } : cur));
        }}
        onUpdated={(next) => {
          setRows((prev) => {
            if (next.role !== "partner" && next.role !== "admin") {
              return prev.filter((row) => row.id !== next.id);
            }
            return prev.map((row) => (row.id === next.id ? next : row));
          });
          setSelected((cur) => (cur && cur.id === next.id ? next : cur));
        }}
      />
    </div>
  );
}
