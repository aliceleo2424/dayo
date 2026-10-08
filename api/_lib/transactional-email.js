'use strict';
const FROM = 'DayO <hello@dayotalk.com>';
const REPLY_TO = 'hello@dayotalk.com';
function locale(value) {
  const code = String(value || '').trim().toLowerCase().replace('_', '-');
  return /^en(?:-|$)/.test(code) ? 'en' : /^ko(?:-|$)/.test(code) ? 'ko' : null;
}
function recipientLocale(role, metadata = {}, requestedLocale) {
  metadata = metadata || {};
  // Only interface preferences, never the booked conversation language or identity.
  return locale(metadata.preferred_language) || (role === 'partner' ? 'en' : locale(requestedLocale) || 'ko');
}
function sender(override) { return String(override || FROM).trim(); }
function escapeHtml(value) { return String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function renderEmail({language, title, intro, lines, link, cta}) {
  return '<!doctype html><html lang="' + language + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;background:#FFFBF4;color:#354737;font-family:Arial,Malgun Gothic,sans-serif">' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 12px">' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border:1px solid #E8E4D8;border-radius:20px"><tr><td style="padding:28px 20px;overflow-wrap:anywhere">' +
    '<p style="color:#5F7D63;font-weight:bold">DayO</p><h1 style="font-size:23px;line-height:1.4">' + escapeHtml(title) + '</h1>' +
    '<p style="line-height:1.6">' + escapeHtml(intro) + '</p>' +
    lines.map(line => '<p style="line-height:1.6;margin:10px 0">' + escapeHtml(line) + '</p>').join('') +
    '<p style="margin-top:24px"><a href="' + link + '" style="display:inline-block;background:#5F7D63;color:#fff;padding:12px 20px;border-radius:12px;text-decoration:none">' + escapeHtml(cta) + '</a></p>' +
    '<p style="font-size:13px;line-height:1.6">' + (language === 'en' ? 'Contact: ' : '문의: ') + '<a href="mailto:hello@dayotalk.com" style="color:#5F7D63">hello@dayotalk.com</a></p>' +
    '</td></tr></table></td></tr></table></body></html>';
}
function buildWelcomeMessage(nickname, role, language, from) {
  const en = language === 'en', partner = role === 'partner';
  const name = nickname && nickname !== '회원' ? nickname : (en ? 'there' : '회원');
  const title = partner ? (en ? 'Welcome to DayO Partner Lounge' : 'DayO Partner Lounge에 오신 것을 환영해요') :
    (en ? 'Get ready for your first DayO conversation' : '외국인 파트너와 첫 대화를 준비해 보세요');
  const intro = en ? 'Hello, ' + name + '!' : '안녕하세요, ' + name + '님!';
  const lines = partner ? (en ? [
    'Share interests and everyday stories through relaxed 1:1 global conversations.',
    'Check your profile, schedule and Partner Guide in Partner Lounge.'
  ] : ['취향과 일상을 나누는 편안한 1:1 글로벌 대화에 함께해 주세요.', 'Partner Lounge에서 프로필, 일정과 Partner Guide를 확인해 주세요.']) : (en ? [
    'When you want to use another language with a real person, try a relaxed 1:1 video conversation with a DayO conversation partner.',
    'Choose a conversation partner. If you would like Korean help, you can choose a partner who speaks Korean.',
    'Start with Talk Cards and open AI word help whenever you need an expression.',
    'Choose as many sessions as you need, starting from one, with no subscription.',
    'A KRW 9,900 first-session offer is available. Tickets are issued after payment.',
    'Explore how conversations work on DayO.'
  ] : [
    '배운 외국어를 실제 사람과 써보고 싶을 때, DayO에서 외국인 파트너와 편하게 1:1 화상 대화를 나눠 보세요.',
    '외국인 파트너를 선택하고, 한국어 도움이 필요하다면 한국어 가능한 파트너를 고를 수 있어요.',
    'Talk Card(이야기 카드)로 대화를 시작하고, 막히는 순간에는 AI 단어 도움을 직접 열어 표현을 확인해요.',
    '정기결제 없이 1회부터 필요한 만큼 선택할 수 있어요.',
    '첫 이용 9,900원 할인 혜택이 준비돼 있어요. 이용권은 결제 후 지급돼요.',
    '먼저 DayO에서 대화 방식을 살펴보세요.'
  ]);
  const link = partner ? 'https://www.dayotalk.com/partner' : 'https://www.dayotalk.com/#how';
  const cta = partner ? (en ? 'View Partner Lounge' : 'Partner Lounge 확인') : (en ? 'Explore DayO' : 'DayO 둘러보기');
  return {from: sender(from), reply_to: REPLY_TO, subject: '[DayO] ' + title,
    html: renderEmail({language, title, intro, lines, link, cta}),
    text: [intro, '', ...lines, '', cta + ': ' + link, '', (en ? 'Contact: ' : '문의: ') + REPLY_TO, 'DayO'].join('\n')};
}
module.exports = {FROM, REPLY_TO, locale, recipientLocale, sender, escapeHtml, renderEmail, buildWelcomeMessage};
