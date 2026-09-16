"use client";

import { useEffect, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

type SettingKey = "banner_popup" | "magazine_posts" | "real_reviews";

function useSiteSetting<T>(key: SettingKey, initialValue: T, tabName: string) {
  const [value, setValue] = useState<T>(initialValue);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      const result = await supabase.from("site_settings").select("value").eq("key", key).maybeSingle();
      if (!active) return;
      if (result.error) setError(result.error.message);
      else if (result.data?.value != null) setValue(result.data.value as T);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [key]);

  async function save() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await supabase.from("site_settings").upsert({
        key,
        value,
        updated_at: new Date().toISOString(),
      }, { onConflict: "key" }).select("key, updated_at").single();
      if (result.error) throw result.error;
      const success = `✅ ${tabName} 설정이 저장되어 dayotalk.com 메인에 즉시 반영되었습니다.`;
      setNotice(success);
      window.setTimeout(() => setNotice((current) => current === success ? "" : current), 4500);
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : `${tabName} 설정 저장에 실패했습니다.`;
      console.error(`[DayO CMS] ${key} save failed`, saveError);
      setError(message);
      window.alert(`${tabName} 설정을 저장하지 못했습니다.\n${message}`);
    } finally {
      setSaving(false);
    }
  }

  return { value, setValue, loading, saving, notice, error, save };
}

function EditorStatus({ notice, error }: { notice: string; error: string }) {
  return (
    <>
      {notice && (
        <div className="fixed right-6 top-6 z-[100] max-w-md rounded-xl bg-emerald-600 px-5 py-4 text-sm font-semibold text-white shadow-xl">
          {notice}
        </div>
      )}
      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
    </>
  );
}

type BannerPopup = {
  enabled: boolean;
  text: string;
  link: string;
  popup_enabled: boolean;
  popup_title: string;
  popup_content: string;
  popup_image_url: string;
};

const DEFAULT_BANNER: BannerPopup = {
  enabled: false,
  text: "",
  link: "",
  popup_enabled: false,
  popup_title: "",
  popup_content: "",
  popup_image_url: "",
};

export function BannerPopupEditor() {
  const editor = useSiteSetting<BannerPopup>("banner_popup", DEFAULT_BANNER, "배너/팝업");
  const value = { ...DEFAULT_BANNER, ...editor.value };
  const patch = (next: Partial<BannerPopup>) => editor.setValue({ ...value, ...next });

  if (editor.loading) return <div className="h-52 animate-pulse rounded-xl bg-muted" />;

  return (
    <div className="space-y-5">
      <EditorStatus notice={editor.notice} error={editor.error} />
      <Card>
        <CardHeader><CardTitle>상단 공지 띠배너</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="flex items-center gap-3 md:col-span-2">
            <Switch checked={value.enabled} onCheckedChange={(enabled) => patch({ enabled })} />
            <Label>메인 화면에 띠배너 표시</Label>
          </div>
          <div className="space-y-2">
            <Label>공지 문구</Label>
            <Input value={value.text} onChange={(event) => patch({ text: event.target.value })} placeholder="새로운 소식을 입력하세요" />
          </div>
          <div className="space-y-2">
            <Label>클릭 이동 링크</Label>
            <Input value={value.link} onChange={(event) => patch({ link: event.target.value })} placeholder="#tickets 또는 https://..." />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>팝업 관리</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="flex items-center gap-3 md:col-span-2">
            <Switch checked={value.popup_enabled} onCheckedChange={(popup_enabled) => patch({ popup_enabled })} />
            <Label>메인 진입 시 팝업 표시</Label>
          </div>
          <div className="space-y-2">
            <Label>팝업 제목</Label>
            <Input value={value.popup_title} onChange={(event) => patch({ popup_title: event.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>팝업 이미지 URL</Label>
            <Input value={value.popup_image_url} onChange={(event) => patch({ popup_image_url: event.target.value })} placeholder="https://..." />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>팝업 내용</Label>
            <Textarea value={value.popup_content} onChange={(event) => patch({ popup_content: event.target.value })} />
          </div>
        </CardContent>
      </Card>
      <Button variant="coral" size="lg" disabled={editor.saving} onClick={() => void editor.save()}>
        <Save className="mr-2 h-4 w-4" /> {editor.saving ? "저장 중..." : "변경사항 저장"}
      </Button>
    </div>
  );
}

type MagazinePost = {
  id: string;
  title: string;
  category: string;
  thumbnail_url: string;
  summary: string;
  link: string;
  is_active: boolean;
};

function emptyMagazinePost(): MagazinePost {
  return { id: crypto.randomUUID(), title: "", category: "", thumbnail_url: "", summary: "", link: "", is_active: true };
}

export function MagazinePostsEditor() {
  const editor = useSiteSetting<MagazinePost[]>("magazine_posts", [], "라운지 매거진");
  const posts = Array.isArray(editor.value) ? editor.value : [];
  const update = (index: number, next: Partial<MagazinePost>) => {
    editor.setValue(posts.map((post, postIndex) => postIndex === index ? { ...post, ...next } : post));
  };

  if (editor.loading) return <div className="h-64 animate-pulse rounded-xl bg-muted" />;

  return (
    <div className="space-y-5">
      <EditorStatus notice={editor.notice} error={editor.error} />
      <div className="flex justify-end">
        <Button variant="outline" onClick={() => editor.setValue([...posts, emptyMagazinePost()])}>
          <Plus className="mr-2 h-4 w-4" /> 새 매거진 카드 추가
        </Button>
      </div>
      {!posts.length && <p className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">등록된 매거진 카드가 없습니다.</p>}
      {posts.map((post, index) => (
        <Card key={post.id}>
          <CardContent className="grid gap-4 p-5 md:grid-cols-2">
            <div className="flex items-center justify-between md:col-span-2">
              <div className="flex items-center gap-3">
                <Switch checked={post.is_active !== false} onCheckedChange={(is_active) => update(index, { is_active })} />
                <Label>메인 노출</Label>
              </div>
              <Button size="sm" variant="outline" className="text-rose-600" onClick={() => editor.setValue(posts.filter((_, itemIndex) => itemIndex !== index))}>
                <Trash2 className="mr-1 h-4 w-4" /> 삭제
              </Button>
            </div>
            <div className="space-y-2"><Label>제목</Label><Input value={post.title} onChange={(e) => update(index, { title: e.target.value })} /></div>
            <div className="space-y-2"><Label>카테고리</Label><Input value={post.category} onChange={(e) => update(index, { category: e.target.value })} /></div>
            <div className="space-y-2"><Label>썸네일 URL</Label><Input value={post.thumbnail_url} onChange={(e) => update(index, { thumbnail_url: e.target.value })} placeholder="https://..." /></div>
            <div className="space-y-2"><Label>이동 링크</Label><Input value={post.link} onChange={(e) => update(index, { link: e.target.value })} placeholder="https://... 또는 /..." /></div>
            <div className="space-y-2 md:col-span-2"><Label>한 줄 요약</Label><Textarea className="min-h-20" value={post.summary} onChange={(e) => update(index, { summary: e.target.value })} /></div>
          </CardContent>
        </Card>
      ))}
      <Button variant="coral" size="lg" disabled={editor.saving} onClick={() => void editor.save()}>
        <Save className="mr-2 h-4 w-4" /> {editor.saving ? "저장 중..." : "변경사항 저장"}
      </Button>
    </div>
  );
}

type RealReview = {
  id: string;
  author: string;
  tag: string;
  quote: string;
  emoji: string;
  is_active: boolean;
};

function emptyReview(): RealReview {
  return { id: crypto.randomUUID(), author: "", tag: "", quote: "", emoji: "☕", is_active: true };
}

export function RealReviewsEditor() {
  const editor = useSiteSetting<RealReview[]>("real_reviews", [], "후기 관리");
  const reviews = Array.isArray(editor.value) ? editor.value : [];
  const update = (index: number, next: Partial<RealReview>) => {
    editor.setValue(reviews.map((review, reviewIndex) => reviewIndex === index ? { ...review, ...next } : review));
  };

  if (editor.loading) return <div className="h-64 animate-pulse rounded-xl bg-muted" />;

  return (
    <div className="space-y-5">
      <EditorStatus notice={editor.notice} error={editor.error} />
      <div className="flex justify-end">
        <Button variant="outline" onClick={() => editor.setValue([...reviews, emptyReview()])}>
          <Plus className="mr-2 h-4 w-4" /> 새 후기 추가
        </Button>
      </div>
      {!reviews.length && <p className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">등록된 후기가 없습니다.</p>}
      {reviews.map((review, index) => (
        <Card key={review.id}>
          <CardContent className="grid gap-4 p-5 md:grid-cols-[90px_1fr_1fr]">
            <div className="space-y-2"><Label>이모지</Label><Input value={review.emoji} onChange={(e) => update(index, { emoji: e.target.value })} /></div>
            <div className="space-y-2"><Label>작성자명</Label><Input value={review.author} onChange={(e) => update(index, { author: e.target.value })} /></div>
            <div className="space-y-2"><Label>태그</Label><Input value={review.tag} onChange={(e) => update(index, { tag: e.target.value })} placeholder="여행 · 일상 회화" /></div>
            <div className="space-y-2 md:col-span-3"><Label>후기 인용문</Label><Textarea className="min-h-20" value={review.quote} onChange={(e) => update(index, { quote: e.target.value })} /></div>
            <div className="flex items-center justify-between md:col-span-3">
              <div className="flex items-center gap-3">
                <Switch checked={review.is_active !== false} onCheckedChange={(is_active) => update(index, { is_active })} />
                <Label>메인 노출</Label>
              </div>
              <Button size="sm" variant="outline" className="text-rose-600" onClick={() => editor.setValue(reviews.filter((_, itemIndex) => itemIndex !== index))}>
                <Trash2 className="mr-1 h-4 w-4" /> 삭제
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
      <Button variant="coral" size="lg" disabled={editor.saving} onClick={() => void editor.save()}>
        <Save className="mr-2 h-4 w-4" /> {editor.saving ? "저장 중..." : "변경사항 저장"}
      </Button>
    </div>
  );
}
