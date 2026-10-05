'use client';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { addDays, calendarCells, copySchedule, groupAvailability, kstDate, shiftMonth, timeLabel, type AvailabilityDay, type PartnerAvailability } from '@/lib/partner-availability';

function DayTimes({ day }: { day: AvailabilityDay }) {
  return <div className="flex flex-wrap gap-2">
    {day.available.map(time => <span key={time} className="rounded-md bg-emerald-50 px-2 py-1 text-sm text-emerald-800">{timeLabel(time)}</span>)}
    {day.booked.map(time => <span key={time} className="rounded-md bg-gray-100 px-2 py-1 text-sm text-gray-500">{timeLabel(time)} · 예약됨</span>)}
  </div>;
}
export function PartnerAvailabilitySection({ partnerId, name }: { partnerId: string; name: string }) {
  const [result,setResult] = useState<{ id: string; data?: PartnerAvailability; error?: string } | null>(null);
  const [range,setRange] = useState(30);
  const [view,setView] = useState<'list'|'calendar'>('list');
  const [selected,setSelected] = useState('');
  const [month,setMonth] = useState(()=>kstDate(Date.now()).slice(0,7));
  const [notice,setNotice] = useState('');
  const [refresh,setRefresh] = useState(0);
  const [now,setNow] = useState(Date.now());
  useEffect(()=>{
    let active=true;
    setResult(null); setNotice('');
    const fail=()=>{if(active) setResult({id:partnerId,error:'예약 가능 시간을 불러오지 못했습니다. 관리자 권한과 조회 RPC 적용 상태를 확인해 주세요.'});};
    supabase.rpc('get_admin_partner_availability',{p_partner_id:partnerId}).then(({data,error})=>{
      if(!active) return;
      if(error || !data || data.partner_id!==partnerId || !Array.isArray(data.slots)) { fail(); return; }
      setResult({id:partnerId,data:data as PartnerAvailability});
    },fail);
    return ()=>{ active=false; };
  },[partnerId,refresh]);
  useEffect(()=>{ const timer=setInterval(()=>setNow(Date.now()),30000); return ()=>clearInterval(timer); },[]);
  const data=result?.id===partnerId ? result.data : undefined;
  const days=useMemo(()=>data ? groupAvailability(data,range,now) : [],[data,range,now]);
  const start=kstDate(now), end=addDays(start,range-1);
  const firstMonth=start.slice(0,7), lastMonth=end.slice(0,7);
  const shownMonth=month < firstMonth || month > lastMonth ? firstMonth : month;
  const chosen=days.find(day=>day.date===selected);
  const availableCount=days.reduce((total,day)=>total+day.available.length,0);
  async function copy() {
    setNotice('');
    if (!data) return;
    try { await navigator.clipboard.writeText(copySchedule(name,groupAvailability(data,range))); setNotice('일정을 복사했습니다.'); }
    catch { setNotice('복사하지 못했습니다. 브라우저 클립보드 권한을 확인하고 다시 시도해 주세요.'); }
  }
  return <section aria-label="파트너 예약 가능 시간" className="min-w-0 space-y-3 rounded-xl border bg-white p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-semibold">예약 가능 시간 <span className="text-xs font-normal text-muted-foreground">KST</span></h3>
      <Button type="button" size="sm" variant="outline" onClick={()=>setRefresh(value=>value+1)}>새로고침</Button>
    </div>
    <p className="text-xs text-muted-foreground">실제 사용자 예약 가능 기준으로 표시됩니다. 예약 완료된 시간은 복사 일정에서 제외됩니다.</p>
    <div className="flex flex-wrap items-center gap-2">
      <label className="text-sm">조회 범위 <select aria-label="조회 범위" value={range} onChange={event=>{setRange(Number(event.target.value));setNotice('');}} className="ml-2 rounded-md border p-2 text-sm">
        {[7,14,30].map(value=><option key={value} value={value}>{value}일</option>)}</select></label>
      <div role="group" aria-label="보기 방식" className="flex gap-1">
        <Button type="button" size="sm" variant={view==='list'?'default':'outline'} aria-pressed={view==='list'} onClick={()=>setView('list')}>목록</Button>
        <Button type="button" size="sm" variant={view==='calendar'?'default':'outline'} aria-pressed={view==='calendar'} onClick={()=>setView('calendar')}>달력</Button>
      </div>
      <Button type="button" size="sm" variant="outline" disabled={!data || !availableCount} onClick={()=>void copy()}>일정 복사</Button>
    </div>
    {!result || result.id!==partnerId ? <p role="status" className="text-sm">예약 가능 시간을 불러오는 중입니다…</p> : result.error ? <p role="alert" className="text-sm text-red-700">{result.error}</p> : data && <>
      {!data.capability_configured && <p className="text-sm text-amber-700">예약용 대화 가능 언어가 미설정되어 공개 예약 가능한 시간이 없습니다.</p>}
      {view==='list' ? <div className="max-h-80 space-y-4 overflow-y-auto">
        {!days.length ? <p className="text-sm text-muted-foreground">이 기간에 예약 가능한 시간이 없습니다.</p> : days.map(day=><div key={day.date}><h4 className="mb-2 text-sm font-semibold">{day.date} · KST</h4><DayTimes day={day}/></div>)}
      </div> : <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <Button type="button" size="sm" variant="outline" aria-label="이전 달" disabled={shownMonth===firstMonth} onClick={()=>setMonth(shiftMonth(shownMonth,-1))}>←</Button>
          <span className="text-sm font-semibold">{shownMonth} · KST</span>
          <Button type="button" size="sm" variant="outline" aria-label="다음 달" disabled={shownMonth===lastMonth} onClick={()=>setMonth(shiftMonth(shownMonth,1))}>→</Button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs">
          {['일','월','화','수','목','금','토'].map(label=><span key={label} className="py-1 text-muted-foreground">{label}</span>)}
          {calendarCells(shownMonth).map((date,index)=>{
            const day=days.find(item=>item.date===date);
            return date ? <button key={date} type="button" disabled={date<start || date>end || !day} aria-label={`${date}${day?.available.length?' · 예약 가능':''}${day?.booked.length?' · 예약됨':''}`} aria-pressed={selected===date} onClick={()=>setSelected(date)} className={`min-w-0 rounded-md border py-2 disabled:opacity-40 ${selected===date?'border-emerald-700 bg-emerald-50':''}`}>
              {Number(date.slice(8,10))}<span className="block h-3 text-emerald-700">{day?.available.length?'●':day?.booked.length?'○':''}</span>
            </button> : <span key={`blank-${index}`}/>;
          })}
        </div>
        {chosen && chosen.date>=start && chosen.date<=end ? <div><h4 className="mb-2 text-sm font-semibold">{chosen.date} · KST</h4><DayTimes day={chosen}/></div> : <p className="text-sm text-muted-foreground">시간을 확인할 날짜를 선택해 주세요.</p>}
      </div>}
    </>}
    {notice && <p role="status" className="break-words text-sm">{notice}</p>}
  </section>;
}
