export const INTERESTS = ["drama","movies","youtube","music","travel","food_cafe","exercise","games","fashion_beauty","pets","books_webtoon","work_school"] as const;
export const INTEREST_LABELS = ["드라마","영화","유튜브 · 쇼츠","음악","여행","맛집 · 카페","운동","게임","패션 · 뷰티","반려동물","책 · 웹툰","일 · 학교"];
export const PURPOSES = ["travel","work_school","abroad","casual"] as const;
export const PURPOSE_LABELS = ["여행 · 일상","일 · 학교 생활","워홀 · 유학 준비","자유 수다"];
export const POST_TYPES = ["partner_story","culture_note","conversation_starter"] as const;
export const ARTICLE_COLUMNS = "id,title,category,summary,content,thumbnail_url,is_published,published,created_at,slug,post_type,author_type,author_display_name,partner_id,country,language,interests,purposes,published_at,featured,sort_order,updated_at";
export type PostMetadata = {
 slug: string | null; post_type: string; author_type: string; author_display_name: string;
 partner_id: string | null; country: string | null; language: string | null;
 interests: string[]; purposes: string[]; featured: boolean; sort_order: number;
 published_at?: string | null; updated_at?: string | null;
};
export const EMPTY_METADATA: PostMetadata = {slug:null,post_type:"conversation_starter",author_type:"editor",author_display_name:"DayO",partner_id:null,country:null,language:null,interests:[],purposes:[],featured:false,sort_order:0};
export function safePostImage(value: string | null | undefined) {
 try { const url=new URL(String(value||"")); return url.protocol==="https:"?url.href:""; } catch { return ""; }
}
export function validatePostMetadata(value: PostMetadata): string | null {
 if(value.slug && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(value.slug))return "URL 이름은 영문 소문자·숫자·하이픈만 사용할 수 있습니다.";
 if(!POST_TYPES.includes(value.post_type as typeof POST_TYPES[number]))return "포스트 유형을 확인해 주세요.";
 if(!["editor","partner"].includes(value.author_type))return "작성자 유형을 확인해 주세요.";
 if(!value.author_display_name.trim())return "작성자 표시명을 입력해 주세요.";
 if(value.language && !["en","es","fr","ko"].includes(value.language))return "언어를 확인해 주세요.";
 if(value.partner_id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.partner_id))return "Partner 연결을 확인해 주세요.";
 if(value.interests.length>4 || new Set(value.interests).size!==value.interests.length || value.interests.some(k=>!INTERESTS.includes(k as typeof INTERESTS[number])))return "관심사는 최대 4개까지 선택할 수 있습니다.";
 if(value.purposes.length>4 || new Set(value.purposes).size!==value.purposes.length || value.purposes.some(k=>!PURPOSES.includes(k as typeof PURPOSES[number])))return "대화 목적을 확인해 주세요.";
 if(!Number.isInteger(value.sort_order))return "정렬 순서는 정수로 입력해 주세요.";
 return null;
}
