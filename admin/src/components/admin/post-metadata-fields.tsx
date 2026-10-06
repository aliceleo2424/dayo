"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { INTERESTS,INTEREST_LABELS,PURPOSES,PURPOSE_LABELS, type PostMetadata } from "@/lib/conversation-posts";
type Partner = { id:string; nickname?:string; name?:string };
export function PostMetadataFields({value,onChange}:{value:PostMetadata;onChange:(next:Partial<PostMetadata>)=>void}) {
 const [partners,setPartners]=useState<Partner[]>([]);
 useEffect(()=>{let active=true;void supabase.rpc("list_public_partner_profiles").then(({data})=>{if(active)setPartners((data||[]) as Partner[]);});return()=>{active=false;};},[]);
 function toggle(field:"interests"|"purposes",key:string){const old=value[field];onChange({[field]:old.includes(key)?old.filter(x=>x!==key):[...old,key]});}
 const input="mt-1 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm";
 return <fieldset className="grid min-w-0 gap-4 rounded-xl border p-4 sm:grid-cols-2"><legend className="px-2 text-sm font-semibold">대화 포스트 설정</legend>
  <label className="text-sm">URL 이름 (선택)<input className={input} value={value.slug||""} onChange={e=>onChange({slug:e.target.value.trim()||null})}/></label>
  <label className="text-sm">포스트 유형<select className={input} value={value.post_type} onChange={e=>onChange({post_type:e.target.value})}><option value="partner_story">파트너 이야기</option><option value="culture_note">문화 이야기</option><option value="conversation_starter">대화 시작 주제</option></select></label>
  <label className="text-sm">작성자 표시명<input className={input} value={value.author_display_name} onChange={e=>onChange({author_display_name:e.target.value})}/></label>
  <label className="text-sm">작성자 유형<select className={input} value={value.author_type} onChange={e=>onChange({author_type:e.target.value})}><option value="editor">DayO 편집자</option><option value="partner">Partner</option></select></label>
  <label className="text-sm">Partner 연결 (선택)<select className={input} value={value.partner_id||""} onChange={e=>onChange({partner_id:e.target.value||null})}><option value="">연결 없음</option>{partners.map(p=><option key={p.id} value={p.id}>{p.nickname||p.name||"Partner"}</option>)}</select></label>
  <label className="text-sm">국가<input className={input} value={value.country||""} onChange={e=>onChange({country:e.target.value||null})}/></label>
  <label className="text-sm">언어<select className={input} value={value.language||""} onChange={e=>onChange({language:e.target.value||null})}><option value="">선택 안 함</option><option value="en">영어</option><option value="es">스페인어</option><option value="fr">프랑스어</option><option value="ko">한국어</option></select></label>
  <label className="text-sm">정렬 순서<input className={input} type="number" step="1" value={value.sort_order} onChange={e=>onChange({sort_order:Number(e.target.value)})}/></label>
  <div className="sm:col-span-2"><p className="mb-2 text-sm">관심사 (최대 4개)</p><div className="flex flex-wrap gap-2">{INTERESTS.map((key,i)=><label key={key} className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={value.interests.includes(key)} disabled={!value.interests.includes(key)&&value.interests.length>=4} onChange={()=>toggle("interests",key)}/>{INTEREST_LABELS[i]}</label>)}</div></div>
  <div className="sm:col-span-2"><p className="mb-2 text-sm">대화 목적</p><div className="flex flex-wrap gap-3">{PURPOSES.map((key,i)=><label key={key} className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={value.purposes.includes(key)} onChange={()=>toggle("purposes",key)}/>{PURPOSE_LABELS[i]}</label>)}</div></div>
  <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={value.featured} onChange={e=>onChange({featured:e.target.checked})}/>홈 우선 노출</label>
 </fieldset>;
}
