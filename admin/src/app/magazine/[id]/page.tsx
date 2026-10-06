import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { ReactNode } from "react";
import { INTERESTS, INTEREST_LABELS, safePostImage } from "@/lib/conversation-posts";
import { PostBookingCta } from "@/components/post-booking-cta";

type Article = {
  id: string;
  title: string;
  post_type: string;
  slug: string | null;
  author_type: string;
  author_display_name: string;
  country: string | null;
  language: string | null;
  interests: string[];
  published_at: string | null;
  summary: string | null;
  content: string;
  thumbnail_url: string | null;
  created_at: string;
};

const siteUrl = "https://www.dayotalk.com";
export const dynamic = "force-dynamic";

async function fetchArticle(id: string): Promise<Article | null> {
  const { data, error } = await supabase.rpc("get_published_conversation_post", { p_key: id });
  if (error || !data) return null;
  return { ...data, summary: data.excerpt, content: data.body, thumbnail_url: safePostImage(data.cover_image), created_at: data.published_at } as Article;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date).replace(/\s/g, "").replace(/\.$/, "");
}

function categoryLabel(type: string) {
  return ({ partner_story: "파트너 이야기", culture_note: "문화 이야기", conversation_starter: "대화의 시작" } as Record<string,string>)[type] || "대화 이야기";
}

function inlineMarkdown(value: string): ReactNode[] {
  return value.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\((?:https?:\/\/|\/)[^)]+\))/g).map((part, index) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={index} className="font-bold text-[#292524]">{part.slice(2, -2)}</strong>;
    if (/^`[^`]+`$/.test(part)) return <code key={index} className="rounded bg-[#F3EEE8] px-1.5 py-0.5 text-[0.9em]">{part.slice(1, -1)}</code>;
    const link = part.match(/^\[([^\]]+)\]\(((?:https?:\/\/|\/)[^)]+)\)$/);
    if (link) return <a key={index} href={link[2]} className="font-semibold text-[#5F7D63] underline underline-offset-4">{link[1]}</a>;
    return part;
  });
}

function renderMarkdown(markdown: string) {
  const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }
    const heading = line.match(/^(#{2,3})\s+(.+)$/);
    if (heading) {
      const children = inlineMarkdown(heading[2]);
      blocks.push(heading[1].length === 2
        ? <h2 key={index} className="mb-4 mt-12 text-2xl font-bold tracking-tight text-[#292524]">{children}</h2>
        : <h3 key={index} className="mb-3 mt-9 text-xl font-bold text-[#292524]">{children}</h3>);
      index += 1;
      continue;
    }
    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) quote.push(lines[index++].replace(/^>\s?/, ""));
      blocks.push(<blockquote key={`quote-${index}`} className="my-8 border-l-4 border-[#5F7D63] bg-[#FFFBF4] px-5 py-4 text-[#57534E]">{inlineMarkdown(quote.join("\n"))}</blockquote>);
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) items.push(lines[index++].replace(/^\s*[-*]\s+/, ""));
      blocks.push(<ul key={`ul-${index}`} className="mb-6 list-disc space-y-2 pl-6">{items.map((item, itemIndex) => <li key={itemIndex}>{inlineMarkdown(item)}</li>)}</ul>);
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) items.push(lines[index++].replace(/^\s*\d+\.\s+/, ""));
      blocks.push(<ol key={`ol-${index}`} className="mb-6 list-decimal space-y-2 pl-6">{items.map((item, itemIndex) => <li key={itemIndex}>{inlineMarkdown(item)}</li>)}</ol>);
      continue;
    }
    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() && !/^(#{2,3})\s+|^>\s?|^\s*[-*]\s+|^\s*\d+\.\s+/.test(lines[index])) {
      paragraph.push(lines[index++]);
    }
    blocks.push(<p key={`p-${index}`} className="mb-6 whitespace-pre-wrap">{inlineMarkdown(paragraph.join("\n"))}</p>);
  }
  return blocks;
}

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id } = await params;
  const article = await fetchArticle(id);
  if (!article) return { title: "아티클을 찾을 수 없습니다 | DayO 매거진" };

  const description = article.summary?.trim() || article.content.replace(/[#*_>`-]/g, "").trim().slice(0, 150);
  const url = `${siteUrl}/magazine/${encodeURIComponent(article.slug || article.id)}`;
  const image = article.thumbnail_url || `${siteUrl}/images/dayo-social-preview-20261005.png`;
  return {
    title: `${article.title} | DayO 라운지 매거진`,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      locale: "ko_KR",
      siteName: "DayO",
      title: article.title,
      description,
      url,
      publishedTime: article.published_at || undefined,
      images: [{ url: image, alt: article.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: article.title,
      description,
      images: [image],
    },
  };
}

export default async function MagazineArticlePage(
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const article = await fetchArticle(id);
  if (!article) notFound();

  return (
    <div className="min-h-screen bg-[#F8F0E3] text-[#292524]">
      <header className="border-b border-[#EDE4D5] bg-[#FFFBF4]">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-4 sm:px-6">
          <Link href={siteUrl} className="flex items-center">
            <Image src={`${siteUrl}/images/logo_header.png`} alt="DayO" width={1072} height={599} className="h-8 w-auto object-contain" priority unoptimized />
            <span className="ml-2 inline-flex flex-col justify-center whitespace-nowrap border-l border-[#EDE4D5] pl-2 text-left text-[10px] leading-[1.2]">
              <span className="font-semibold tracking-[-0.2px] text-[#57534E]">1:1 Global Culture</span>
              <span className="font-medium tracking-[-0.2px] text-[#78716C]">Conversation Lounge</span>
            </span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-16">
        <article>
          <header className="mx-auto max-w-3xl text-center">
            <span className="inline-flex rounded-full bg-[#FFFBF4] px-3 py-1 text-sm font-bold text-[#5F7D63]">
              {categoryLabel(article.post_type)}
            </span>
            <h1 className="mt-5 break-keep text-3xl font-bold leading-tight tracking-[-0.03em] text-[#292524] sm:text-5xl">
              {article.title}
            </h1>
            {article.summary ? (
              <p className="mx-auto mt-5 max-w-2xl break-keep text-base leading-7 text-[#78716C] sm:text-lg">
                {article.summary}
              </p>
            ) : null}
            <p className="mt-5 text-sm text-[#A8A29E]">
              {formatDate(article.published_at || article.created_at)} · {article.author_display_name || "DayO"}{article.author_type === "partner" ? " · 파트너" : ""}
              {[article.country, article.language?.toUpperCase()].filter(Boolean).map(value => <span key={value}> · {value}</span>)}
            </p>
          </header>

          <aside id="adsense-top" aria-label="상단 광고" className="mx-auto mt-10 flex h-[100px] max-w-3xl items-center justify-center rounded-2xl border border-dashed border-[#DED8CF] bg-[#F6F3EE] text-[10px] font-semibold tracking-[0.18em] text-[#B0AAA1]">
            ADVERTISEMENT
          </aside>

          {article.thumbnail_url ? (
            <div className="mx-auto mt-10 aspect-[16/9] max-w-3xl overflow-hidden rounded-3xl bg-[#F5F5F4] shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={article.thumbnail_url} alt={article.title} className="h-full w-full object-cover" />
            </div>
          ) : null}

          <div className="mx-auto mt-12 max-w-3xl break-words [overflow-wrap:anywhere] text-[16px] leading-[1.9] text-[#44403C] sm:text-[18px]">
            {renderMarkdown(article.content)}
          </div>

          <aside id="adsense-bottom" aria-label="하단 광고" className="mx-auto mt-12 flex min-h-[120px] max-w-3xl items-center justify-center rounded-2xl border border-dashed border-[#DED8CF] bg-[#F6F3EE] text-[10px] font-semibold tracking-[0.18em] text-[#B0AAA1]">
            ADVERTISEMENT
          </aside>
        </article>

        <div className="mx-auto mt-8 flex max-w-3xl flex-wrap gap-2">
          {(article.interests || []).filter(key => INTERESTS.includes(key as typeof INTERESTS[number])).map(key => <span key={key} className="rounded-full bg-[#FFFBF4] px-3 py-1 text-sm text-[#5F7D63]">{INTEREST_LABELS[INTERESTS.indexOf(key as typeof INTERESTS[number])]}</span>)}
        </div>
        <PostBookingCta postKey={article.slug || article.id} postId={article.id} />

        <div className="mt-10 text-center">
          <Link href={siteUrl} className="text-sm font-semibold text-[#78716C] underline underline-offset-4 hover:text-[#44403C]">
            ← DayO 홈으로 돌아가기
          </Link>
        </div>
      </main>
    </div>
  );
}
