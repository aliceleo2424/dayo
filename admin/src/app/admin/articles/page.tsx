"use client";

import { AdminHeader } from "@/components/admin/header";
import { ArticlesCms } from "@/components/admin/articles-cms";

export default function ArticlesPage() {
  return (
    <>
      <AdminHeader title="라운지 매거진" />
      <main className="p-6">
        <p className="mb-6 text-sm text-muted-foreground">
          [발행하기]는 Supabase articles 테이블에 바로 저장되며, 아래 목록과 마이페이지 라운지 매거진에 반영됩니다.
        </p>
        <ArticlesCms />
      </main>
    </>
  );
}
