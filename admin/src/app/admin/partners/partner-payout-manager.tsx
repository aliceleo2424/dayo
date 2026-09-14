"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { formatCurrency, formatDate } from "@/lib/utils";
import { DataTable, type Column } from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PartnerDetailModal, partnerName, type PartnerProfile } from "@/components/admin/partner-detail-modal";

export function PartnerPayoutManager() {
  const [rows, setRows] = useState<PartnerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<PartnerProfile | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const fullSelect = "id, user_id, nickname, user_name, email, role, visa_type, languages, bank_name, bank_account, account_holder, point_balance, created_at";
    let result = await supabase
      .from("profiles")
      .select(fullSelect)
      .eq("role", "partner")
      .order("created_at", { ascending: false });
    if (result.error) {
      result = await supabase
        .from("profiles")
        .select("id, user_id, nickname, user_name, email, role, point_balance, created_at")
        .eq("role", "partner")
        .order("created_at", { ascending: false });
    }
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

  const pending = rows.reduce((sum, row) => sum + Number(row.point_balance || 0), 0);

  const columns: Column<PartnerProfile & Record<string, unknown>>[] = [
    {
      key: "nickname",
      header: "파트너",
      sortable: true,
      render: (row) => (
        <button type="button" className="text-left" onClick={() => setSelected(row as PartnerProfile)}>
          <p className="font-medium text-coral hover:underline">{partnerName(row as PartnerProfile)}</p>
          <p className="text-xs text-muted-foreground">{String(row.email || "이메일 미등록")}</p>
        </button>
      ),
    },
    {
      key: "languages",
      header: "담당 언어",
      render: (row) => String(row.languages || "미등록"),
    },
    {
      key: "visa_type",
      header: "비자",
      render: (row) => String(row.visa_type || "미등록"),
    },
    {
      key: "point_balance",
      header: "대기 정산",
      sortable: true,
      render: (row) => {
        const pts = Number(row.point_balance || 0);
        return <span className="font-semibold">{formatCurrency(pts)}</span>;
      },
    },
    {
      key: "created_at",
      header: "가입일",
      sortable: true,
      render: (row) => row.created_at ? formatDate(String(row.created_at)) : "—",
    },
    {
      key: "actions",
      header: "",
      render: (row) => (
        <button
          type="button"
          className="text-sm font-medium text-coral hover:underline"
          onClick={() => setSelected(row as PartnerProfile)}
        >
          상세
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">등록 파트너</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{rows.length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">지급 대기 합계</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-coral">{formatCurrency(pending)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">정산 단위</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">1P = 1원</p>
            <Badge className="mt-2" variant="outline">10일 정산</Badge>
          </CardContent>
        </Card>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading ? (
        <p className="text-sm text-muted-foreground">파트너 목록을 불러오는 중…</p>
      ) : (
        <DataTable
          data={rows as (PartnerProfile & Record<string, unknown>)[]}
          columns={columns}
          searchKeys={["nickname", "user_name", "email"]}
          exportFilename="partners.csv"
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
      />
    </div>
  );
}
