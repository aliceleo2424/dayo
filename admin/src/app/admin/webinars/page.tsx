"use client";

import { useEffect, useState } from "react";
import { AdminHeader } from "@/components/admin/header";
import { DataTable, type Column } from "@/components/admin/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { formatDateTime } from "@/lib/utils";

type WebinarLead = Record<string, unknown> & {
  name: string;
  email: string;
  interest_language: string | null;
  interest_language_other: string | null;
  status: string;
  notified: boolean;
  created_at: string;
};

const languageLabels: Record<string, string> = {
  english: "영어",
  japanese: "일본어",
  chinese: "중국어",
  french: "프랑스어",
  spanish: "스페인어",
  other: "기타",
};

const columns: Column<WebinarLead>[] = [
  { key: "name", header: "이름", sortable: true },
  { key: "email", header: "이메일", sortable: true },
  {
    key: "interest_language",
    header: "관심언어",
    sortable: true,
    render: (lead) => {
      if (!lead.interest_language) return "—";
      if (lead.interest_language === "other") {
        return lead.interest_language_other ? `기타 (${lead.interest_language_other})` : "기타";
      }
      return languageLabels[lead.interest_language] || lead.interest_language;
    },
  },
  {
    key: "created_at",
    header: "신청일",
    sortable: true,
    render: (lead) => formatDateTime(lead.created_at),
  },
  {
    key: "status",
    header: "상태",
    render: (lead) => (
      <Badge variant={lead.status === "registered" ? "success" : "default"}>
        {lead.status === "registered" ? "신청 완료" : lead.status}
      </Badge>
    ),
  },
  {
    key: "notified",
    header: "안내 발송",
    render: (lead) => (
      <Badge variant={lead.notified ? "success" : "warning"}>
        {lead.notified ? "발송 완료" : "미발송"}
      </Badge>
    ),
  },
];

export default function WebinarLeadsPage() {
  const [leads, setLeads] = useState<WebinarLead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadLeads() {
      const result = await supabase
        .from("webinar_applications")
        .select("name,email,interest_language,interest_language_other,created_at,status,notified", { count: "exact" })
        .order("created_at", { ascending: false });

      if (!active) return;
      if (result.error) {
        setError("신청자 목록을 불러오지 못했습니다.");
        setLeads([]);
        setTotal(0);
      } else {
        setError("");
        setLeads((result.data || []) as WebinarLead[]);
        setTotal(result.count || 0);
      }
      setLoading(false);
    }

    void loadLeads();
    return () => {
      active = false;
    };
  }, []);

  return (
    <>
      <AdminHeader title="웨비나 사전 신청" />
      <main className="space-y-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle>총 신청자 수</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-navy">{loading ? "—" : total}명</p>
          </CardContent>
        </Card>

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {error}
          </div>
        )}

        <DataTable
          data={leads}
          columns={columns}
          searchKeys={["name", "email"]}
          filters={[
            {
              key: "interest_language",
              label: "관심언어",
              options: [
                { value: "english", label: "영어" },
                { value: "japanese", label: "일본어" },
                { value: "chinese", label: "중국어" },
                { value: "french", label: "프랑스어" },
                { value: "spanish", label: "스페인어" },
                { value: "other", label: "기타" },
              ],
            },
            {
              key: "notified",
              label: "안내 발송",
              options: [
                { value: "false", label: "미발송" },
                { value: "true", label: "발송 완료" },
              ],
            },
          ]}
          exportFilename="webinar-leads.csv"
          emptyMessage={loading ? "신청자 목록을 불러오는 중입니다." : "웨비나 신청자가 없습니다."}
        />
      </main>
    </>
  );
}
