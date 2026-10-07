/* Room closure is independent of financial settlement. Reads authenticated DB facts only. */
(function (w) {
  'use strict';
  function failure(code) { var e = new Error(code); e.code = code; return e; }
  async function load(db, bookingId, participantId) {
    if (!db || typeof db.rpc !== 'function') throw failure('load_failed');
    var timer, result;
    try {
      result = await Promise.race([db.rpc('get_room_session_state', { p_booking_id: bookingId }),
        new Promise(function (_, reject) { timer = setTimeout(function () { reject(failure('load_failed')); }, 10000); })]);
    } finally { clearTimeout(timer); }
    if (!result || result.error) throw failure('load_failed');
    var state = result.data;
    if (!state || state.success !== true) throw failure(state && state.code === 'unauthorized' ? 'auth' : 'access_denied');
    if (state.booking_id !== bookingId || state.participant_id !== participantId ||
        typeof state.session_ended !== 'boolean' || !['learner', 'partner'].includes(state.role)) throw failure('access_denied');
    return state;
  }
  w.DayORoomSessionState = { load: load };
})(window);
