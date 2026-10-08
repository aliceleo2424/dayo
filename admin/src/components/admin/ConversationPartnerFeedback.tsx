"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
const labels: Record<string,string> = {
  "spoke_slowly": "천천히 말해줬어요",
  "waited_for_me": "잘 기다려줬어요",
  "helped_with_words": "단어를 알려줬어요",
  "helped_with_expressions": "표현을 알려줬어요",
  "asked_good_questions": "질문을 잘 해줬어요",
  "made_me_comfortable": "편하게 이야기할 수 있었어요",
  "shared_new_stories": "새로운 이야기를 들려줬어요",
  "kept_conversation_going": "대화를 잘 이어줬어요",
  "speak_more_slowly": "조금 더 천천히 말해주세요",
  "speak_more_quickly": "조금 더 빠르게 말해주세요",
  "wait_more": "제가 말할 때 더 기다려주세요",
  "correct_more": "문장을 더 교정해주세요",
  "help_more_with_words": "모르는 단어를 더 알려주세요",
  "speak_more": "더 많이 말해주세요",
  "listen_more": "더 많이 들어주세요",
  "ask_more_questions": "질문 더 해주세요"
};
type Feedback = { booking_id:string; good:string[]; requests:string[]; private_admin_note:string|null; updated_at:string };
export function ConversationPartnerFeedback({bookingId}:{bookingId:string}) {
 const [attempt,setAttempt]=useState(0),[state,setState]=useState<"loading"|"ready"|"error">("loading"),[row,setRow]=useState<Feedback|null>(null);
 useEffect(()=>{let cancelled=false,expired=false;setState("loading");setRow(null);const timer=setTimeout(()=>{if(!cancelled){expired=true;setState("error");}},8000);
  Promise.resolve(supabase.rpc("admin_get_conversation_partner_feedback",{p_booking_id:bookingId})).then(({data,error})=>{if(cancelled||expired)return;clearTimeout(timer);if(error){setState("error");return;}if(data&&data.booking_id!==bookingId){setState("error");return;}setRow(data);setState("ready");}).catch(()=>{if(!cancelled&&!expired){clearTimeout(timer);setState("error");}});
  return ()=>{cancelled=true;clearTimeout(timer);};
 },[bookingId,attempt]);
 return <section className="mb-5 rounded-xl border border-[#DEDCD5] bg-white p-4"><h3 className="mb-3 text-sm font-semibold">파트너 대화 피드백</h3>
 {state==="loading"?<p className="text-sm text-muted-foreground">불러오는 중…</p>:state==="error"?<><p className="text-sm">피드백을 불러오지 못했습니다.</p><Button variant="outline" size="sm" onClick={()=>setAttempt(n=>n+1)}>다시 시도</Button></>:!row?<p className="text-sm text-muted-foreground">피드백 없음</p>:<>
 {(["good","requests"] as const).map(key=><div className="mb-3" key={key}><h4 className="text-sm font-semibold">{key==="good"?"좋았어요":"다음에는 더 해주세요"}</h4><ul className="mt-1 list-inside list-disc text-sm">{row[key].length?row[key].map(k=><li key={k}>{labels[k]||"알 수 없는 항목"}</li>):<li>선택 없음</li>}</ul></div>)}
 <h4 className="text-sm font-semibold">운영팀 비공개 메모</h4><p className="mt-1 whitespace-pre-wrap break-words text-sm">{row.private_admin_note||"없음"}</p>
 <p className="mt-3 text-xs text-muted-foreground">수정일: {new Date(row.updated_at).toLocaleString("ko-KR")}</p></>}
 </section>;
}
