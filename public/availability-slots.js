/* DayO partner availability slots + learner slot booking */
(function () {
  'use strict';

  var DAY_IDS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  var DAY_LABELS = { mon: '월', tue: '화', wed: '수', thu: '목', fri: '금', sat: '토', sun: '일' };
  var DAY_INDEX = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  var WEEKS_AHEAD = 6;

  function client() {
    return window.supabaseClient || null;
  }

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function toIsoDate(date) {
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  function weekdayIdFromDate(isoDate) {
    var parts = String(isoDate || '').split('-');
    if (parts.length < 3) return '';
    var date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    var map = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    return map[date.getDay()] || '';
  }

  function upcomingDatesForDay(dayId, weeksAhead) {
    var target = DAY_INDEX[dayId];
    var dates = [];
    if (target == null) return dates;
    var start = new Date();
    start.setHours(0, 0, 0, 0);
    var i;
    for (i = 0; i < 7 * (weeksAhead + 1); i += 1) {
      var cur = new Date(start.getTime() + i * 86400000);
      if (cur.getDay() === target) dates.push(toIsoDate(cur));
      if (dates.length >= weeksAhead) break;
    }
    return dates;
  }

  function formatSlotLabel(slotTime) {
    var raw = String(slotTime || '');
    if (raw.indexOf('weekly:') === 0) {
      var weekly = raw.slice(7).split('|');
      return (DAY_LABELS[weekly[0]] || weekly[0]) + ' ' + (weekly[1] || '');
    }
    var match = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})/);
    if (match) return Number(match[2]) + '/' + Number(match[3]) + ' ' + match[4];
    return raw;
  }

  function collectScheduleSlots() {
    var schedule = window.__dayoPartnerSchedule;
    var slots = [];
    if (schedule) {
      DAY_IDS.forEach(function (dayId) {
        var set = schedule[dayId];
        if (!set) return;
        var times = [];
        if (set && typeof set.forEach === 'function') {
          set.forEach(function (time) { times.push(time); });
        }
        times.forEach(function (time) {
          slots.push({ dayId: dayId, time: time });
        });
      });
    }
    if (!slots.length) {
      document.querySelectorAll('.time-chip.open, .time-chip.selected, .slot-open, .slot-btn.active').forEach(function (el) {
        var time = el.getAttribute('data-time') || String(el.textContent || '').trim().slice(0, 5);
        var dayId = el.getAttribute('data-day') || (window.__dayoPartnerActiveDay || 'mon');
        if (time) slots.push({ dayId: dayId, time: time });
      });
    }
    return slots;
  }

  function buildRows(partnerId, openSlots) {
    var rows = [];
    var seen = {};
    openSlots.forEach(function (slot) {
      var weeklyKey = 'weekly:' + slot.dayId + '|' + slot.time;
      if (!seen[weeklyKey]) {
        seen[weeklyKey] = true;
        rows.push({ partner_id: partnerId, slot_time: weeklyKey, status: 'available' });
      }
      upcomingDatesForDay(slot.dayId, WEEKS_AHEAD).forEach(function (isoDate) {
        var dated = isoDate + 'T' + slot.time + ':00';
        if (seen[dated]) return;
        seen[dated] = true;
        rows.push({ partner_id: partnerId, slot_time: dated, status: 'available' });
      });
    });
    return rows;
  }

  window.savePartnerSchedule = async function () {
    var saveBtn = document.querySelector('button[onclick*="스케줄"], .btn-save-schedule')
      || document.getElementById('save-schedule-btn')
      || document.getElementById('saveSchedule');
    var activeSlots = document.querySelectorAll('.slot-btn.active, .time-chip.selected, .slot-open, .time-chip.open');
    var collected = collectScheduleSlots();

    if (collected.length === 0 && activeSlots.length === 0) {
      alert('오픈할 시간대를 최소 1개 이상 선택해 주세요.');
      return;
    }

    var supabase = client();
    if (!supabase) {
      alert('스케줄 저장 중 오류가 발생했습니다: 로그인 서버에 연결할 수 없습니다.');
      return;
    }

    var original = saveBtn ? saveBtn.innerHTML : '';
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = '⏳ 저장 중...';
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('로그인이 필요합니다.');

      var openSlots = collected.length ? collected : Array.from(activeSlots).map(function (el) {
        return {
          dayId: el.getAttribute('data-day') || (window.__dayoPartnerActiveDay || 'mon'),
          time: el.dataset.time || String(el.innerText || '').trim().slice(0, 5)
        };
      });

      var slotsToInsert = buildRows(user.id, openSlots);
      var keepTimes = {};
      slotsToInsert.forEach(function (row) { keepTimes[row.slot_time] = true; });

      var existingRes = await supabase
        .from('availability_slots')
        .select('id, slot_time, status')
        .eq('partner_id', user.id);
      if (existingRes.error) throw existingRes.error;

      var booked = {};
      (existingRes.data || []).forEach(function (row) {
        if (row.status === 'booked') booked[row.slot_time] = true;
      });

      var toUpsert = slotsToInsert.filter(function (row) { return !booked[row.slot_time]; });
      if (toUpsert.length) {
        const { error } = await supabase
          .from('availability_slots')
          .upsert(toUpsert, { onConflict: 'partner_id,slot_time' });
        if (error) throw error;
      }

      var staleIds = (existingRes.data || [])
        .filter(function (row) {
          return row.status === 'available' && !keepTimes[row.slot_time];
        })
        .map(function (row) { return row.id; });
      if (staleIds.length) {
        var delRes = await supabase.from('availability_slots').delete().in('id', staleIds);
        if (delRes.error) throw delRes.error;
      }

      alert('✅ 주간 대화 가능 시간이 성공적으로 저장되었습니다!');
      if (typeof window.showToast === 'function') {
        /* keep existing lounge toast if present */
      }
    } catch (err) {
      console.error('스케줄 저장 오류:', err);
      alert('스케줄 저장 중 오류가 발생했습니다: ' + (err && err.message ? err.message : err));
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = original || '💾 변경된 스케줄 저장하기';
      }
    }
  };

  window.loadPartnerSchedule = async function () {
    var supabase = client();
    var schedule = window.__dayoPartnerSchedule;
    if (!supabase || !schedule) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      var res = await supabase
        .from('availability_slots')
        .select('slot_time, status')
        .eq('partner_id', user.id);
      if (res.error || !res.data || !res.data.length) return;

      var hasWeekly = false;
      DAY_IDS.forEach(function (dayId) {
        if (schedule[dayId] && schedule[dayId].clear) schedule[dayId] = new Set();
      });

      res.data.forEach(function (row) {
        var raw = String(row.slot_time || '');
        if (raw.indexOf('weekly:') === 0) {
          hasWeekly = true;
          var parts = raw.slice(7).split('|');
          if (parts[0] && parts[1]) {
            if (!schedule[parts[0]]) schedule[parts[0]] = new Set();
            schedule[parts[0]].add(parts[1]);
          }
        }
      });

      if (!hasWeekly) {
        res.data.forEach(function (row) {
          var match = String(row.slot_time || '').match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
          if (!match) return;
          var dayId = weekdayIdFromDate(match[1]);
          if (!dayId) return;
          if (!schedule[dayId]) schedule[dayId] = new Set();
          schedule[dayId].add(match[2]);
        });
      }

      if (typeof window.__dayoRenderPartnerTimes === 'function') window.__dayoRenderPartnerTimes();
    } catch (err) {
      console.warn('[DayO] loadPartnerSchedule failed', err);
    }
  };

  window.loadAvailableSlots = async function (partnerId) {
    var container = document.getElementById('partner-slots-container');
    if (!container) return;
    var supabase = client();
    if (!supabase) {
      container.innerHTML = '<div style="font-size: 12px; color: #888;">현재 예약 가능한 시간대가 없습니다.</div>';
      return;
    }

    var query = supabase
      .from('availability_slots')
      .select('*')
      .eq('status', 'available')
      .order('slot_time', { ascending: true });
    var dateFilter = window.__dayoSelectedBookingDate || '';
    var startOfSelectedDate = dateFilter ? dateFilter + ' 00:00:00' : '';
    var endOfSelectedDate = dateFilter ? dateFilter + ' 23:59:59' : '';
    if (partnerId && /^[0-9a-f-]{36}$/i.test(partnerId)) query = query.eq('partner_id', partnerId);
    if (startOfSelectedDate && endOfSelectedDate) {
      query = query.gte('slot_time', startOfSelectedDate).lte('slot_time', endOfSelectedDate);
    }

    const { data: slots, error } = await query;

    var visible = (slots || []).filter(function (s) {
      var raw = String(s.slot_time || '');
      if (raw.indexOf('weekly:') === 0) return false;
      if (dateFilter) return raw.indexOf(dateFilter) === 0;
      return raw.indexOf('T') > 0 || /\d{4}-\d{2}-\d{2}\s/.test(raw);
    });

    if (error || !visible.length) {
      container.innerHTML = '<div style="font-size: 12px; color: #888;">현재 예약 가능한 시간대가 없습니다.</div>';
      return;
    }

    container.innerHTML = visible.map(function (s) {
      var label = formatSlotLabel(s.slot_time);
      return (
        '<button type="button" class="btn-time-slot" onclick="requestBooking(\'' + s.id + '\', \'' + s.partner_id + '\')"' +
          ' style="padding: 8px 12px; margin: 4px; border-radius: 8px; border: 1px solid #635BFF; background: #EEEDFF; color: #635BFF; font-weight: 700; cursor: pointer;">' +
          label + ' 예약' +
        '</button>'
      );
    }).join('');
  };

  window.loadAvailableSlotsForDate = async function (isoDate) {
    window.__dayoSelectedBookingDate = isoDate || '';
    return window.loadAvailableSlots();
  };

  window.requestBooking = async function (slotId, partnerId) {
    if (!confirm('티켓 1장을 사용하여 이 시간대로 예약하시겠습니까?')) return;

    var supabase = client();
    if (!supabase) {
      alert('예약 처리 중 통신 오류가 발생했습니다.');
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      alert('로그인 후 예약이 가능합니다.');
      return;
    }

    const { data: booking, error } = await supabase
      .from('bookings')
      .insert({
        learner_id: user.id,
        partner_id: partnerId,
        partner_user_id: partnerId,
        slot_id: slotId,
        status: 'pending'
      })
      .select()
      .single();

    if (error || !booking) {
      alert('예약 생성 실패: ' + ((error && error.message) || '알 수 없는 오류'));
      return;
    }

    try {
      localStorage.setItem('dayo_active_booking_id', booking.id);
      localStorage.setItem('dayo_session_learner_id', user.id);
    } catch (e) { /* ignore */ }

    var confirmFn = window.handleConfirmBooking;
    const success = typeof confirmFn === 'function'
      ? await confirmFn(user.id, booking.id)
      : false;
    if (success) {
      await supabase.from('availability_slots').update({ status: 'booked' }).eq('id', slotId);
      alert('🎉 예약이 확정되었습니다! 마이페이지에서 입장 링크를 확인하세요.');
      location.reload();
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      if (window.__dayoPartnerSchedule) window.loadPartnerSchedule();
    });
  } else if (window.__dayoPartnerSchedule) {
    window.loadPartnerSchedule();
  }
})();
