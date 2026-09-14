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

export type ArticleRow = {
  id: string;
  title: string;
  category: string | null;
  summary: string | null;
  content: string;
  thumbnail_url: string | null;
  is_published: boolean | null;
  created_at: string;
};

const CATEGORIES = ["꿀팁", "문화", "대화팁", "공지"];

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
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: err } = await supabase
      .from("articles")
      .select("id, title, category, summary, content, thumbnail_url, is_published, created_at")
      .order("created_at", { ascending: false });
    if (err) {
      setError("articles 테이블을 읽을 수 없습니다. 마이그레이션 018을 Supabase에 적용해 주세요.");
      setRows([]);
    } else {
      setRows((data || []) as ArticleRow[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
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
      category: form.category,
      summary: form.summary.trim() || null,
      content: form.content.trim(),
      thumbnail_url: form.thumbnail_url.trim() || null,
      is_published: form.is_published,
    };
    const query = editingId
      ? supabase.from("articles").update(payload).eq("id", editingId)
      : supabase.from("articles").insert(payload);
    const { error: err } = await query;
    setSaving(false);
    if (err) {
      setError(err.message || "발행에 실패했습니다.");
      return;
    }
    setNotice(editingId ? "아티클이 수정·발행되었습니다." : "새 아티클이 발행되었습니다.");
    resetForm();
    load();
  }

  async function togglePublished(row: ArticleRow, next: boolean) {
    const { error: err } = await supabase.from("articles").update({ is_published: next }).eq("id", row.id);
    if (err) {
      setError(err.message);
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, is_published: next } : r)));
  }

  async function remove(row: ArticleRow) {
    if (!window.confirm(`「${row.title}」 아티클을 삭제할까요?`)) return;
    const { error: err } = await supabase.from("articles").delete().eq("id", row.id);
    if (err) {
      setError(err.message);
      return;
    }
    if (editingId === row.id) resetForm();
    load();
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
            <Button variant="coral" onClick={publish} disabled={saving}>
              {saving ? "저장 중…" : "발행하기"}
            </Button>
            {editingId && (
              <Button variant="outline" onClick={resetForm}>새 글로 전환</Button>
            )}
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {notice && <p className="text-sm text-emerald-700">{notice}</p>}
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
