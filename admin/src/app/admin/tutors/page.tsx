"use client";

import { AdminHeader } from "@/components/admin/header";
import { DataTable, type Column } from "@/components/admin/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { tutors, classReports } from "@/lib/mockData";
import type { Tutor, ClassReport } from "@/lib/types";
import { LANGUAGE_LABELS } from "@/lib/types";
import { formatDate } from "@/lib/utils";

const statusLabels = { active: "활동중", on_leave: "휴가", inactive: "비활성" };

export default function TutorsPage() {
  const tutorColumns: Column<Tutor & Record<string, unknown>>[] = [
    {
      key: "name", header: "대화 파트너", sortable: true,
      render: (r) => (
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-navy text-xs text-white">{r.avatarInitial as string}</div>
          <div><p className="font-medium">{r.name as string}</p><p className="text-xs text-muted-foreground">{r.nationality as string}</p></div>
        </div>
      ),
    },
    { key: "languages", header: "언어", render: (r) => (r.languages as string[]).map((l) => LANGUAGE_LABELS[l as keyof typeof LANGUAGE_LABELS]).join(", ") },
    { key: "status", header: "상태", render: (r) => <Badge variant={r.status === "active" ? "success" : "default"}>{statusLabels[r.status as keyof typeof statusLabels]}</Badge> },
    { key: "rating", header: "평점", sortable: true, render: (r) => `⭐ ${r.rating}` },
    { key: "totalClasses", header: "수업", sortable: true },
    { key: "noShowRate", header: "노쇼율", sortable: true, render: (r) => `${r.noShowRate}%` },
  ];

  const reportColumns: Column<ClassReport & Record<string, unknown>>[] = [
    { key: "date", header: "날짜", sortable: true, render: (r) => formatDate(r.date as string) },
    { key: "tutorName", header: "대화 파트너", sortable: true },
    { key: "userName", header: "학생" },
    { key: "rating", header: "별점", render: (r) => r.noShow ? "—" : `⭐ ${r.rating}` },
    { key: "noShow", header: "노쇼", render: (r) => r.noShow ? <Badge variant="warning">노쇼</Badge> : <Badge variant="success">출석</Badge> },
    { key: "issue", header: "이슈", render: (r) => (r.issue as string) || "—" },
  ];

  const avgRating = (tutors.reduce((s, t) => s + t.rating, 0) / tutors.length).toFixed(2);
  const avgNoShow = (classReports.filter((r) => r.noShow).length / classReports.length * 100).toFixed(1);

  return (
    <>
      <AdminHeader title="대화 파트너 & 클래스 관리" />
      <main className="p-6">
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">활동 대화 파트너</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{tutors.filter((t) => t.status === "active").length}</p></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">평균 만족도</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{avgRating}</p></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">노쇼 비율</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-coral">{avgNoShow}%</p></CardContent></Card>
        </div>

        <Tabs defaultValue="tutors">
          <TabsList>
            <TabsTrigger value="tutors">대화 파트너 프로필</TabsTrigger>
            <TabsTrigger value="reports">수업 리포트</TabsTrigger>
          </TabsList>

          <TabsContent value="tutors" className="mt-6">
            <DataTable data={tutors as (Tutor & Record<string, unknown>)[]} columns={tutorColumns} searchKeys={["name", "nationality"]} exportFilename="tutors.csv" />
          </TabsContent>

          <TabsContent value="reports" className="mt-6">
            <DataTable data={classReports as (ClassReport & Record<string, unknown>)[]} columns={reportColumns} searchKeys={["tutorName", "userName"]} exportFilename="class-reports.csv" />
          </TabsContent>
        </Tabs>
      </main>
    </>
  );
}
