// Guidebook delivery email body (HTML + text).
// Non-ad version (default): guidebook only. Ad version: only when the visitor ticked the
// optional marketing consent in this same request; adds the DayO introduction, "(광고)" subject
// and an advertising footer with sender details and an unsubscribe link.
const GUIDE = 'https://www.dayotalk.com/guidebook/level-1';
const SITE = 'https://www.dayotalk.com';
const IMG = SITE + '/images/emma/';

// Starting chapter per dessert type, from the guidebook's PART 0 table (moment → chapter).
const TYPES = {
  mac: { name: '마카롱', kind: '완벽주의 침묵형', part: 'PART 2', partTitle: '할 말이 생각 안 나면, 잠깐 시간을 벌면 돼요.', note: '문장이 완성될 때까지 기다리지 않아도 괜찮아요.' },
  cookie: { name: '쿠키', kind: '단어 던지기형', part: 'PART 2', partTitle: '단어가 안 나올 때도, 잠깐 시간을 벌면 돼요.', note: '문장 전체를 포기하지 않아도 괜찮아요.' },
  cup: { name: '컵케이크', kind: '웃음 방패형', part: 'PART 1', partTitle: '못 알아들었다면, 다시 물어보면 돼요.', note: '웃고 넘기지 않아도 괜찮아요.' },
  pud: { name: '푸딩', kind: '듣기만 프로형', part: 'PART 5', partTitle: '내 말이 끝났다면, 상대에게 넘기면 돼요.', note: '질문 하나로 대화를 돌려주면 돼요.' }
};

// Sentences quoted from the guidebook, PART 1.
const PREVIEW = [
  ['Could you say that again?', '쿠쥬 세이 댓 어게인 · 다시 한번 말해주겠어요?'],
  ['I didn’t catch that.', '아이 디든 캐치 댓 · 방금 말을 놓쳤어요.'],
  ['A little slower, please.', '어 리틀 슬로워, 플리즈 · 조금만 더 천천히요.']
];

const INTRO = [
  ['막히면 한국어로 말해도 돼요', '한국어가 통하는 외국인 파트너라 막힐 때 한국어로 물어볼 수 있어요.'],
  ['점수도 숙제도 없어요', '수업이 아니라 대화예요. 고쳐 달라고 할 때만 알려줘요.'],
  ['첫마디는 대화 카드가 꺼내줘요', '여행·음식·밸런스 게임 카드로 말이 끊기지 않게 이어가요.'],
  ['대화가 끝나도 남아요', '대화 기록, 단어 퀴즈, 파트너의 편지와 기념 그림을 다시 볼 수 있어요.']
];

const FONT = "font-family:'Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR',sans-serif";

function typeOf(value) { return Object.prototype.hasOwnProperty.call(TYPES, value) ? value : null; }

function subject(type, ad) {
  const t = TYPES[type];
  const base = t ? t.name + '님, 가이드북이 도착했어요 ☕' : '첫 대화 전, 이 가이드북부터 가볍게 읽어보세요 ☕';
  return (ad ? '(광고) ' : '') + base;
}

function introHtml() {
  const rows = INTRO.map(([title, desc]) =>
    `<tr><td style="padding:9px 0;vertical-align:top;width:14px;color:#5F7D63;font-weight:700">✓</td><td style="padding:9px 0 9px 8px"><b style="font-size:15px;color:#40362F">${title}</b><br><span style="font-size:13px;line-height:1.6;color:#5F574F">${desc}</span></td></tr>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #E7DDD0;border-radius:18px;margin-bottom:18px"><tr><td style="padding:24px">
<p style="margin:0 0 6px;font-size:13px;color:#5F7D63;font-weight:700">DayO에서는 이렇게 대화해요</p>
<p style="margin:0 0 4px;font-size:22px;line-height:1.4;font-weight:700;color:#40362F">영어가 서툴러도, 대화가 돼요.</p>
<p style="margin:0 0 10px;font-size:14px;color:#5F574F">외국인 파트너와 나누는 25분 1:1 화상 대화</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFF4CC;border-radius:14px;margin-top:12px"><tr>
<td style="padding:14px 16px"><b style="font-size:16px;color:#40362F">첫 대화 9,900원</b><br><span style="font-size:12px;color:#6B5D3F">정기결제 없이 · 앱 설치 없이 브라우저에서 바로</span></td>
<td style="padding:14px 16px;text-align:right"><a href="${SITE}/" style="display:inline-block;background:#5F7D63;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:11px 16px;border-radius:12px">첫 대화 예약하기</a></td>
</tr></table></td></tr></table>`;
}

function typeHtml(type) {
  const t = TYPES[type];
  if (!t) return '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFF4CC;border:1px solid #F1E3A6;border-radius:18px;margin-bottom:18px"><tr>
<td style="padding:18px 0 18px 18px;width:96px;vertical-align:middle"><img src="${IMG}${type}.png" width="88" height="88" alt="${t.name}" style="display:block;border:0"></td>
<td style="padding:18px;vertical-align:middle"><p style="margin:0;font-size:12px;font-weight:700;color:#5F7D63">나의 대화 디저트 · ${t.kind}</p>
<p style="margin:4px 0 6px;font-size:18px;font-weight:700;color:#40362F">${t.name}님은 ${t.part}부터 펼쳐보세요</p>
<p style="margin:0;font-size:13px;line-height:1.6;color:#5F574F">${t.partTitle}<br>${t.note}</p></td></tr></table>`;
}

function previewHtml() {
  const rows = PREVIEW.map(([en, ko]) =>
    `<tr><td style="padding:0 0 8px"><div style="background:#ffffff;border:1px solid #E7DDD0;border-radius:12px;padding:12px 14px"><b style="font-size:15px;color:#40362F">${en}</b><br><span style="font-size:12px;color:#6B5D3F">${ko}</span></div></td></tr>`).join('');
  return `<p style="margin:6px 0 10px;font-size:15px;font-weight:700;color:#40362F">가이드북 미리보기 · 못 알아들었을 때</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`;
}

function build({ type, ad, unsubscribe }) {
  type = typeOf(type);
  const footer = ad
    ? `광고성 정보 수신에 동의하신 분께 보내는 메일입니다. 보낸 곳: DayO · <a href="mailto:hello@dayotalk.com" style="color:#4F7C59">hello@dayotalk.com</a><br>더 이상 받고 싶지 않다면 <a href="${unsubscribe}" style="color:#4F7C59">수신 거부</a>`
    : `요청하신 PDF 가이드북 전달용 메일입니다. 마케팅 수신 동의로 사용하지 않습니다.<br>수신 동의 철회·이메일 정보 삭제 요청: <a href="mailto:hello@dayotalk.com" style="color:#4F7C59">hello@dayotalk.com</a> · <a href="${unsubscribe}" style="color:#4F7C59">수신 거부</a>`;
  const html = `<div style="background:#F6EFE3;padding:24px 12px;${FONT};color:#40362F">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#FFFBF4;border-radius:20px;overflow:hidden">
<tr><td style="background:#FFF4CC;padding:18px 24px;border-bottom:1px solid #F1E3A6"><b style="font-size:20px;color:#3F5A45">DayO 돼요</b></td></tr>
<tr><td style="padding:24px">
${ad ? introHtml() : ''}${typeHtml(type)}${previewHtml()}
<p style="text-align:center;margin:22px 0 8px"><a href="${GUIDE}" style="display:inline-block;background:#5F7D63;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:14px 30px;border-radius:14px">가이드북 열기 (PDF 21쪽)</a></p>
<p style="text-align:center;margin:0 0 20px;font-size:12px;color:#706259">처음부터 다 읽지 않아도 돼요. 지금 자주 막히는 장부터 보면 돼요.</p>
<p style="font-size:11px;line-height:1.7;color:#706259;border-top:1px solid #E7DDD0;padding-top:14px;margin:0">${footer}</p>
</td></tr></table></div>`;
  const t = TYPES[type];
  const text = [
    '안녕하세요, DayO 돼요입니다.', '',
    ...(ad ? ['DayO에서는 외국인 파트너와 25분 1:1 화상 대화를 나눠요. 막히면 한국어로 말해도 되고, 점수도 숙제도 없어요.', '첫 대화 9,900원 · 정기결제 없이: ' + SITE + '/', ''] : []),
    ...(t ? [t.name + '님은 ' + t.part + '부터 펼쳐보세요. ' + t.partTitle, ''] : []),
    '가이드북 미리보기 · 못 알아들었을 때', ...PREVIEW.map(([en, ko]) => '- ' + en + ' (' + ko + ')'), '',
    '가이드북 열기: ' + GUIDE, '',
    ad ? '광고성 정보 수신에 동의하신 분께 보내는 메일입니다. 보낸 곳: DayO · hello@dayotalk.com'
       : '이 메일은 요청하신 PDF 가이드북 전달용입니다. 마케팅 수신 동의로 사용하지 않습니다.\n수신 동의 철회·이메일 정보 삭제 요청: hello@dayotalk.com',
    '광고성 이메일 수신 거부: ' + unsubscribe
  ].join('\n');
  return { subject: subject(type, ad), html, text };
}

module.exports = { build, typeOf, TYPES, GUIDE };
