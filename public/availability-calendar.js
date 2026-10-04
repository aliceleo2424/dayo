/* Shared KST calendar rules. Holidays are labels, never availability decisions. */
(function (root) {
  'use strict';
  var sources = ['https://www.kasa.go.kr/bbs/BBSMSTR_000000000010/view.do?nttId=B000000001860Pe2zT3', 'https://www.kasi.re.kr/file/1764661238731_1.pdf', 'https://www.kasa.go.kr/prog/plcyBrf/brief/kor/sub01_01_04/view.do?plcyBrfNo=431', 'https://astro.kasi.re.kr/kor/life/post/calendarData?search_year=2027'];
  // Remaining 2026 and 2027 holidays verified against KASA/KASI published tables.
  // No inferred lunar dates; renew the static labels before the coverage expires.
  var holidays = {
    '2026-09-24':['추석 연휴','Chuseok holiday'], '2026-09-25':['추석','Chuseok'], '2026-09-26':['추석 연휴','Chuseok holiday'],
    '2026-10-03':['개천절','National Foundation Day'], '2026-10-05':['대체공휴일','Substitute holiday'],
    '2026-10-09':['한글날','Hangul Day'], '2026-12-25':['성탄절','Christmas Day'], '2027-01-01':['신정','New Year’s Day'],
    '2027-02-06':['설 연휴','Seollal holiday'], '2027-02-07':['설날','Seollal'], '2027-02-08':['설 연휴','Seollal holiday'], '2027-02-09':['대체공휴일','Substitute holiday'],
    '2027-03-01':['삼일절','Independence Movement Day'], '2027-05-01':['노동절','Labour Day'], '2027-05-03':['대체공휴일','Substitute holiday'],
    '2027-05-05':['어린이날','Children’s Day'], '2027-05-13':['부처님오신날','Buddha’s Birthday'], '2027-06-06':['현충일','Memorial Day'],
    '2027-07-17':['제헌절','Constitution Day'], '2027-07-19':['대체공휴일','Substitute holiday'], '2027-08-15':['광복절','Liberation Day'], '2027-08-16':['대체공휴일','Substitute holiday'],
    '2027-09-14':['추석 연휴','Chuseok holiday'], '2027-09-15':['추석','Chuseok'], '2027-09-16':['추석 연휴','Chuseok holiday'],
    '2027-10-03':['개천절','National Foundation Day'], '2027-10-04':['대체공휴일','Substitute holiday'], '2027-10-09':['한글날','Hangul Day'], '2027-10-11':['대체공휴일','Substitute holiday'],
    '2027-12-25':['성탄절','Christmas Day'], '2027-12-27':['대체공휴일','Substitute holiday']
  };
  function dateAt(ms) { return new Date(ms + 9 * 3600000).toISOString().slice(0,10); }
  function addDays(date, count) { return new Date(Date.parse(date+'T00:00:00Z') + count*86400000).toISOString().slice(0,10); }
  // Exactly 30 KST calendar dates, including today: offsets 0 through 29.
  function windowDates(now) { var today=dateAt(now==null?Date.now():now); return {start:today,end:addDays(today,29)}; }
  function inWindow(date,now) { var w=windowDates(now); return date>=w.start&&date<=w.end; }
  function slotMs(value) {
    var s=String(value||'').trim().replace(' ','T');
    if(!/^\d{4}-\d{2}-\d{2}T\d{2}:(00|30)/.test(s))return NaN;
    if(/[+-]\d{2}$/.test(s))s+=':00';else if(/[+-]\d{4}$/.test(s))s=s.slice(0,-2)+':'+s.slice(-2);
    else if(!/(Z|[+-]\d{2}:\d{2})$/i.test(s))s+='+09:00';
    return Date.parse(s);
  }
  var times=Array.from({length:30},function(_,i){var n=510+i*30;return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');});
  var api={dateAt:dateAt,addDays:addDays,windowDates:windowDates,inWindow:inWindow,slotMs:slotMs,times:times,
    holiday:function(date,ko){if([2026,2027].indexOf(Number(String(date).slice(0,4)))<0)return '';var h=holidays[date];return h?h[ko?0:1]:'';},
    holidaySupportedYears:[2026,2027],
    holidayCoverage:{start:'2026-09-24',end:'2027-12-31'},holidaySources:sources,
    missingRPC:function(error){return !!error&&['PGRST202','42883'].indexOf(error.code)>=0;}};
  root.DayOAvailabilityCalendar=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='object'?window:globalThis);
