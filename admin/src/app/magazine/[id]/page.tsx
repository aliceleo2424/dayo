import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import type { ReactNode } from "react";

type Article = {
  id: string;
  title: string;
  category: string | null;
  summary: string | null;
  content: string;
  thumbnail_url: string | null;
  created_at: string;
};

const siteUrl = "https://dayotalk.com";
const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "https://mmhapsimcngmtefqfrcg.supabase.co")
  .replace(/\/rest\/v1\/?$/i, "")
  .replace(/\/+$/, "");
const supabaseAnonKey = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();

async function fetchArticle(id: string): Promise<Article | null> {
  if (!supabaseAnonKey) return null;
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
  const { data, error } = await supabase
    .from("articles")
    .select("id, title, category, summary, content, thumbnail_url, created_at")
    .eq("id", id)
    .eq("is_published", true)
    .single();

  if (error || !data) return null;
  return data as Article;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date).replace(/\s/g, "").replace(/\.$/, "");
}

function categoryLabel(category: string | null) {
  const value = String(category || "대화팁");
  if (/여행/.test(value)) return `✈️ ${value}`;
  if (/문화/.test(value)) return `🌏 ${value}`;
  return `☕ ${value}`;
}

function inlineMarkdown(value: string): ReactNode[] {
  return value.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\((?:https?:\/\/|\/)[^)]+\))/g).map((part, index) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={index} className="font-bold text-[#292524]">{part.slice(2, -2)}</strong>;
    if (/^`[^`]+`$/.test(part)) return <code key={index} className="rounded bg-[#F3EEE8] px-1.5 py-0.5 text-[0.9em]">{part.slice(1, -1)}</code>;
    const link = part.match(/^\[([^\]]+)\]\(((?:https?:\/\/|\/)[^)]+)\)$/);
    if (link) return <a key={index} href={link[2]} className="font-semibold text-[#D95F49] underline underline-offset-4">{link[1]}</a>;
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
      blocks.push(<blockquote key={`quote-${index}`} className="my-8 border-l-4 border-[#FF8B73] bg-[#FFF7F2] px-5 py-4 text-[#57534E]">{inlineMarkdown(quote.join("\n"))}</blockquote>);
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
  const url = `${siteUrl}/magazine/${article.id}`;
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
      publishedTime: article.created_at,
      images: article.thumbnail_url ? [{ url: article.thumbnail_url, alt: article.title }] : [],
    },
    twitter: {
      card: article.thumbnail_url ? "summary_large_image" : "summary",
      title: article.title,
      description,
      images: article.thumbnail_url ? [article.thumbnail_url] : [],
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
    <div className="min-h-screen bg-[#FFFCF9] text-[#292524]">
      <header className="border-b border-[#EDE4D5] bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-4 sm:px-6">
          <Link href={siteUrl} className="flex items-center">
            <Image src="/images/logo.png" alt="DayO" width={112} height={36} className="h-8 w-auto object-contain" priority />
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
            <span className="inline-flex rounded-full bg-[#FFF0EB] px-3 py-1 text-sm font-bold text-[#D95F49]">
              {categoryLabel(article.category)}
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
              {formatDate(article.created_at)} · DayO 매거진 에디터
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

          <div className="mx-auto mt-12 max-w-3xl text-[16px] leading-[1.9] text-[#44403C] sm:text-[18px]">
            {renderMarkdown(article.content)}
          </div>

          <aside id="adsense-bottom" aria-label="하단 광고" className="mx-auto mt-12 flex min-h-[120px] max-w-3xl items-center justify-center rounded-2xl border border-dashed border-[#DED8CF] bg-[#F6F3EE] text-[10px] font-semibold tracking-[0.18em] text-[#B0AAA1]">
            ADVERTISEMENT
          </aside>
        </article>

        <section className="mx-auto mt-12 max-w-3xl rounded-3xl bg-gradient-to-br from-[#FFF0EB] to-[#FFF7DC] px-6 py-9 text-center sm:px-10">
          <h2 className="break-keep text-xl font-bold text-[#292524] sm:text-2xl">
            오늘 읽은 표현, 원어민 파트너와 직접 써보고 싶다면?
          </h2>
          <a href={`${siteUrl}/#partners`} className="mt-6 inline-flex rounded-full bg-[#FF755E] px-6 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#EB654F]">
            🎟️ 첫 세션 9,900원으로 대화 시작하기
          </a>
        </section>

        <div className="mt-10 text-center">
          <Link href={siteUrl} className="text-sm font-semibold text-[#78716C] underline underline-offset-4 hover:text-[#44403C]">
            ← DayO 홈으로 돌아가기
          </Link>
        </div>
      </main>
    </div>
  );
}
