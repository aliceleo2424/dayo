"use client";

import { AdminHeader } from "@/components/admin/header";
import { ArticlesCms } from "@/components/admin/articles-cms";

export default function ArticlesPage() {
  return (
    <>
      <AdminHeader title="라운지 매거진" />
      <main className="p-6">
        <p className="mb-6 text-sm text-muted-foreground">
          발행된 글은 마이페이지 하단 DayO 라운지 매거진 카드에 바로 반영됩니다.
        </p>
        <ArticlesCms />
      </main>
    </>
  );
}
