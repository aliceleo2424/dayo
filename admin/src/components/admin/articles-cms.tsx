"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ImagePlus, Loader2 } from "lucide-react";

export type ArticleRow = {
  id: string;
  title: string;
  category: string | null;
  summary: string | null;
  content: string;
  thumbnail_url: string | null;
  is_published: boolean | null;
  published: boolean | null;
  created_at: string;
};

const CATEGORIES = ["꿀팁", "문화", "대화팁", "공지"];

function articlesError(err: { message?: string; code?: string } | null, fallback: string) {
  const message = String(err?.message || "");
  const code = String(err?.code || "");
  if (code === "42P01" || /does not exist|relation .*articles/i.test(message)) {
    return "articles 테이블이 없습니다. 마이그레이션 018과 030을 적용해 주세요.";
  }
  if (code === "42501" || /row-level security|permission denied|RLS/i.test(message)) {
    return "articles RLS가 쓰기를 막고 있습니다. 관리자 로그인 상태와 마이그레이션 030 적용 여부를 확인해 주세요.";
  }
  return message || fallback;
}

const emptyForm = {
  title: "",
  category: "대화팁",
  summary: "",
  content: "",
  thumbnail_url: "",
  is_published: true,
};

export function ArticlesCms() {
  const [rows, setRows] = useState<ArticleRow[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    const { data, error: err } = await supabase
      .from("articles")
      .select("id, title, category, summary, content, thumbnail_url, is_published, published, created_at")
      .order("created_at", { ascending: false });
    if (err) {
      setError(articlesError(err, "articles 테이블을 읽을 수 없습니다. 마이그레이션 018·030을 적용해 주세요."));
      setRows([]);
    } else {
      setError("");
      setRows((data || []) as unknown as ArticleRow[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel("articles-cms")
      .on("postgres_changes", { event: "*", schema: "public", table: "articles" }, () => {
        void load({ silent: true });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load]);

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
  }

  function startEdit(row: ArticleRow) {
    setEditingId(row.id);
    setForm({
      title: row.title || "",
      category: row.category || "꿀팁",
      summary: row.summary || "",
      content: row.content || "",
      thumbnail_url: row.thumbnail_url || "",
      is_published: row.is_published !== false,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function uploadThumbnail(file: File) {
    if (!file.type.startsWith("image/")) {
      setError("이미지 파일만 업로드할 수 있습니다.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("썸네일은 10MB 이하 파일만 업로드할 수 있습니다.");
      return;
    }
    const extension = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `magazine/${Date.now()}-${crypto.randomUUID()}.${extension}`;
    setUploading(true);
    setError("");
    try {
      const result = await supabase.storage.from("public-assets").upload(path, file, {
        cacheControl: "3600",
        contentType: file.type,
        upsert: false,
      });
      if (result.error) throw result.error;
      const publicUrl = supabase.storage.from("public-assets").getPublicUrl(result.data.path).data.publicUrl;
      setForm((current) => ({ ...current, thumbnail_url: publicUrl }));
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : "썸네일 업로드에 실패했습니다.";
      console.error("[DayO Articles] thumbnail upload failed", uploadError);
      setError(message);
      window.alert(`썸네일을 업로드하지 못했습니다.\n${message}`);
    } finally {
      setUploading(false);
    }
  }

  async function publish() {
    if (!form.title.trim() || !form.content.trim()) {
      setError("제목과 본문은 필수입니다.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    const payload = {
      title: form.title.trim(),
      category: form.category || "대화팁",
      summary: form.summary.trim() || null,
      content: form.content.trim(),
      thumbnail_url: form.thumbnail_url.trim() || null,
      is_published: form.is_published,
      published: form.is_published,
    };
    const ARTICLES_COLS = "id, title, category, summary, content, thumbnail_url, is_published, published, created_at";
    const result = editingId
      ? await supabase.from("articles").update(payload).eq("id", editingId).select(ARTICLES_COLS)
      : await supabase.from("articles").insert({ ...payload, created_at: new Date().toISOString() }).select(ARTICLES_COLS);
    setSaving(false);
    if (result.error) {
      const message = articlesError(result.error, "발행에 실패했습니다. 마이그레이션 030을 적용해 주세요.");
      setError(message);
      window.alert(`아티클을 저장하지 못했습니다.\n${message}`);
      await load({ silent: true });
      return;
    }
    const saved = ((result.data || [])[0] || null) as ArticleRow | null;
    if (saved) {
      setRows((prev) => [saved, ...prev.filter((row) => row.id !== saved.id)]);
    }
    const success = editingId ? "🎉 아티클이 성공적으로 수정되었습니다!" : "🎉 아티클이 성공적으로 발행되었습니다!";
    setNotice(success);
    window.setTimeout(() => setNotice((current) => current === success ? "" : current), 4500);
    resetForm();
    await load({ silent: true });
  }

  async function togglePublished(row: ArticleRow, next: boolean) {
    const { error: err } = await supabase.from("articles").update({ is_published: next, published: next }).eq("id", row.id);
    if (err) {
      setError(articlesError(err, "발행 상태 변경에 실패했습니다."));
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, is_published: next } : r)));
    await load({ silent: true });
  }

  async function remove(row: ArticleRow) {
    if (!window.confirm("이 아티클을 삭제하시겠습니까?")) return;
    const { error: err } = await supabase.from("articles").delete().eq("id", row.id);
    if (err) {
      setError(articlesError(err, "삭제에 실패했습니다."));
      return;
    }
    if (editingId === row.id) resetForm();
    setRows((prev) => prev.filter((item) => item.id !== row.id));
    await load({ silent: true });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{editingId ? "아티클 수정" : "새 아티클 작성"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="article-title">제목</Label>
              <Input
                id="article-title"
                className="mt-1"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="라운지에 노출될 제목"
              />
            </div>
            <div>
              <Label>카테고리</Label>
              <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="article-thumb">썸네일 URL</Label>
              <Input
                id="article-thumb"
                className="mt-1"
                value={form.thumbnail_url}
                onChange={(e) => setForm((f) => ({ ...f, thumbnail_url: e.target.value }))}
                placeholder="https://..."
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <label className="inline-flex h-9 cursor-pointer items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent">
                  {uploading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> 업로드 중...</> : <><ImagePlus className="mr-2 h-4 w-4" /> 사진 파일 선택</>}
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    disabled={uploading}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void uploadThumbnail(file);
                      event.target.value = "";
                    }}
                  />
                </label>
                <span className="text-xs text-muted-foreground">최대 10MB</span>
              </div>
              {form.thumbnail_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.thumbnail_url} alt="썸네일 미리보기" className="mt-3 h-24 w-40 rounded-lg border object-cover" />
              )}
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="article-summary">한 줄 요약</Label>
              <Input
                id="article-summary"
                className="mt-1"
                value={form.summary}
                onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
                placeholder="카드에 보일 짧은 소개"
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="article-content">본문</Label>
              <Textarea
                id="article-content"
                className="mt-1"
                value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                placeholder="매거진 본문"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch checked={form.is_published} onCheckedChange={(v) => setForm((f) => ({ ...f, is_published: v }))} />
              <span className="text-sm">바로 발행</span>
            </div>
            <Button variant="coral" onClick={publish} disabled={saving || uploading}>
              {saving ? "저장 중…" : "발행하기"}
            </Button>
            {editingId && (
              <Button variant="outline" onClick={resetForm}>새 글로 전환</Button>
            )}
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {notice && <div className="fixed right-6 top-6 z-[100] rounded-xl bg-emerald-600 px-5 py-4 text-sm font-semibold text-white shadow-xl">{notice}</div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>작성된 아티클</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">불러오는 중…</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">제목</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">카테고리</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">작성일</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">발행</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b">
                      <td className="px-4 py-3 font-medium">{row.title}</td>
                      <td className="px-4 py-3"><Badge variant="outline">{row.category || "꿀팁"}</Badge></td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(row.created_at)}</td>
                      <td className="px-4 py-3">
                        <Switch checked={row.is_published !== false} onCheckedChange={(v) => togglePublished(row, v)} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => startEdit(row)}>편집</Button>
                          <Button variant="outline" size="sm" className="text-red-600" onClick={() => remove(row)}>삭제</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!rows.length && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">아직 작성된 아티클이 없습니다.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
