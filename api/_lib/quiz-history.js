/* Read-only quiz cooldown. Uses the caller's JWT/RLS; never transcript vocabulary. */
const recap = require('../../public/conversation-recap.js');
const validDate = v => typeof v === 'string' && Number.isFinite(Date.parse(v));
function eligible(b, current, learnerId) {
  return b && b.id && b.id !== current.id && b.learner_id === learnerId &&
    b.status === 'completed' && b.end_reason === 'normal' && b.is_test_session !== true &&
    validDate(b.completed_at) && validDate(b.scheduled_at) &&
    Date.parse(b.scheduled_at) < Date.parse(current.scheduled_at) &&
    Date.parse(b.completed_at) < Date.parse(current.scheduled_at) &&
    recap.language(b.language) === recap.language(current.language);
}
async function load(read, current, learnerId) {
  if (current.learner_id !== learnerId || !validDate(current.scheduled_at) || recap.language(current.language) !== 'en')
    return { status: 'unavailable', words: [] };
  try {
    const rows = await read('/rest/v1/bookings?' + new URLSearchParams({
      learner_id: 'eq.' + learnerId, id: 'neq.' + current.id, status: 'eq.completed',
      end_reason: 'eq.normal', or: '(is_test_session.eq.false,is_test_session.is.null)',
      scheduled_at: 'lt.' + current.scheduled_at, completed_at: 'lt.' + current.scheduled_at,
      language: 'in.(en,english,EN,English)',
      select: 'id,learner_id,status,end_reason,is_test_session,scheduled_at,completed_at,language',
      order: 'completed_at.desc,id.desc', limit: '3'
    }));
    if (!Array.isArray(rows)) throw Error('history-shape');
    const seen = new Set();
    const previous = rows.filter(b => eligible(b,current,learnerId) && !seen.has(b.id) && seen.add(b.id))
      .sort((a,b) => Date.parse(b.completed_at)-Date.parse(a.completed_at) || b.id.localeCompare(a.id)).slice(0,3);
    if (!previous.length) return { status:'available', words:[] };
    const reports = await read('/rest/v1/session_reports?' + new URLSearchParams({
      learner_id:'eq.'+learnerId, booking_id:'in.('+previous.map(b=>b.id).join(',')+')',
      select:'booking_id,learner_id,feedback', limit:'3'
    }));
    if (!Array.isArray(reports)) throw Error('report-shape');
    const keys = new Set();
    reports.forEach(report => {
      if (report.learner_id !== learnerId || !previous.some(b=>b.id===report.booking_id)) return;
      const saved = recap.saved(report);
      if (!saved || recap.language(saved.language)!==recap.language(current.language)) return;
      (Array.isArray(saved.questions)?saved.questions:[]).forEach(q=>{
        if (q && ['synonym','antonym'].includes(q.type) && typeof q.word==='string') {
          const key=recap.quizWordKey(q.word);if(key)keys.add(key);
        }
      });
    });
    return { status:'available', words:Array.from(keys) };
  } catch (_) { return { status:'unavailable', words:[] }; }
}
module.exports={load,eligible};
