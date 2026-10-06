/* Learner-only conversation rhythm for Talk Record and My Page. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DayOConversationInsights = api;
  if (root && root.document) api.boot(root);
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var FIVE_MINUTES = 5 * 60 * 1000;
  var SESSION_MINUTES = 25;

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }

  function isLearnerRow(row) {
    return !!(row && typeof row === 'object' && String(row.speaker || '').toLowerCase() === 'learner');
  }

  function rowText(row) {
    if (!row || typeof row !== 'object') return '';
    return String(row.text || row.transcript || row.message || '').trim();
  }

  function englishWords(value) {
    return String(value || '').match(/[A-Za-z]+(?:['’][A-Za-z]+)*/g) || [];
  }

  function validTime(value) {
    var time = value ? Date.parse(value) : NaN;
    return Number.isFinite(time) ? time : NaN;
  }

  function earliestLearnerTime(rows) {
    var times = (Array.isArray(rows) ? rows : []).filter(isLearnerRow).map(function (row) {
      return validTime(row.timestamp);
    }).filter(Number.isFinite);
    return times.length ? Math.min.apply(Math, times) : NaN;
  }

  function analyzeSession(rows, scheduledAt) {
    var source = Array.isArray(rows) ? rows : [];
    var learnerCandidates = source.filter(isLearnerRow).map(function (row) {
      var words = englishWords(rowText(row));
      return {
        timestamp: validTime(row.timestamp),
        words: words,
        wordCount: words.length
      };
    }).filter(function (row) { return row.wordCount > 0; });
    var startTime = validTime(scheduledAt);
    if (!Number.isFinite(startTime)) startTime = earliestLearnerTime(source);
    var learnerRows = learnerCandidates.filter(function (row) {
      if (!Number.isFinite(startTime) || !Number.isFinite(row.timestamp)) return false;
      var offset = row.timestamp - startTime;
      return offset >= 0 && offset < SESSION_MINUTES * 60 * 1000;
    });
    var bins = [0, 0, 0, 0, 0];
    learnerRows.forEach(function (row) {
      if (!Number.isFinite(startTime) || !Number.isFinite(row.timestamp)) return;
      var offset = row.timestamp - startTime;
      if (offset < 0 || offset >= SESSION_MINUTES * 60 * 1000) return;
      bins[Math.floor(offset / FIVE_MINUTES)] += row.wordCount;
    });
    var totalWords = learnerRows.reduce(function (sum, row) { return sum + row.wordCount; }, 0);
    return {
      totalWords: totalWords,
      utteranceCount: learnerRows.length,
      averageWords: learnerRows.length ? Math.round((totalWords / learnerRows.length) * 10) / 10 : null,
      bins: bins,
      hasLearnerEvidence: learnerRows.length > 0,
      hasTimedEvidence: Number.isFinite(startTime) && bins.some(function (count) { return count > 0; })
    };
  }

  function sessionInsight(metrics) {
    var bins = metrics && Array.isArray(metrics.bins) ? metrics.bins : [0, 0, 0, 0, 0];
    var total = metrics && Number(metrics.totalWords) || 0;
    if (!metrics || !metrics.hasLearnerEvidence || total === 0) {
      return '이번 대화에서 집계할 수 있는 내가 말한 표현이 없어요.';
    }
    if (total < 20) {
      return '오늘은 조금 조용한 대화였어요. 세션마다 주제와 컨디션에 따라 대화량은 달라질 수 있어요.';
    }
    var peak = Math.max.apply(Math, bins);
    var peakIndex = bins.indexOf(peak);
    var low = Math.min.apply(Math, bins);
    var directionChanges = 0;
    var previousDirection = 0;
    for (var i = 1; i < bins.length; i += 1) {
      var direction = bins[i] === bins[i - 1] ? 0 : (bins[i] > bins[i - 1] ? 1 : -1);
      if (direction && previousDirection && direction !== previousDirection) directionChanges += 1;
      if (direction) previousDirection = direction;
    }
    if (directionChanges >= 2 && peak > 0 && peak - low >= peak * 0.5) {
      return '오늘은 이야기의 리듬이 구간마다 조금 달랐어요.';
    }
    if (peakIndex >= 1 && peakIndex <= 3 && bins[4] <= peak * 0.55) {
      return '오늘은 중반에 가장 많이 이야기하고, 후반에는 조금 차분한 흐름이었어요.';
    }
    if (peak > 0 && peak - low >= peak * 0.65) {
      return '오늘은 이야기의 리듬이 구간마다 조금 달랐어요.';
    }
    if (peakIndex >= 1 && peakIndex <= 3) return '오늘은 중반에 이야기가 가장 활발했어요.';
    return '오늘은 나만의 리듬으로 이야기를 이어갔어요.';
  }

  function seoulParts(value) {
    var date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) return null;
    var parts = {};
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(date).forEach(function (part) {
      if (part.type !== 'literal') parts[part.type] = part.value;
    });
    return { year: parts.year, month: parts.month, day: parts.day };
  }

  function monthKey(value) {
    var parts = seoulParts(value);
    return parts ? parts.year + '-' + parts.month : '';
  }

  function shortDate(value) {
    var parts = seoulParts(value);
    return parts ? Number(parts.month) + '/' + Number(parts.day) : '';
  }

  function seoulMonthBounds(value) {
    var parts = seoulParts(value || new Date());
    if (!parts) return null;
    var year = Number(parts.year);
    var monthIndex = Number(parts.month) - 1;
    var offset = 9 * 60 * 60 * 1000;
    return {
      start: new Date(Date.UTC(year, monthIndex, 1) - offset).toISOString(),
      end: new Date(Date.UTC(year, monthIndex + 1, 1) - offset).toISOString()
    };
  }

  function monthlyInsight(sessions) {
    var rows = Array.isArray(sessions) ? sessions : [];
    if (!rows.length) return '첫 대화를 시작하면 나만의 대화 흐름이 여기에 쌓여요.';
    if (rows.length === 1) return '한 번의 대화가 소중하게 쌓였어요. 조금 더 쌓이면 나만의 흐름을 볼 수 있어요.';
    if (rows.length <= 3) return '대화를 조금 더 쌓으면 나만의 흐름을 볼 수 있어요.';
    var middle = Math.ceil(rows.length / 2);
    var first = rows.slice(0, middle).reduce(function (sum, row) { return sum + row.totalWords; }, 0) / middle;
    var lastRows = rows.slice(middle);
    var last = lastRows.reduce(function (sum, row) { return sum + row.totalWords; }, 0) / lastRows.length;
    if (last > first * 1.15) return '요즘 조금 더 많은 이야기를 나누고 있어요.';
    if (last < first * 0.85) return '이번 달은 조금 차분한 흐름이에요. 대화량은 파트너와 주제에 따라 달라질 수 있어요.';
    return '대화량은 매번 달라도, 경험은 계속 쌓이고 있어요.';
  }

  function summarizeMonth(sessions, now) {
    var key = monthKey(now || new Date());
    var inMonth = (Array.isArray(sessions) ? sessions : []).filter(function (session) {
      return session && monthKey(session.date) === key && session.metrics;
    }).map(function (session) {
      return {
        id: String(session.id || ''),
        date: session.date,
        label: shortDate(session.date),
        totalWords: Number(session.metrics.totalWords) || 0,
        hasLearnerEvidence: session.metrics.hasLearnerEvidence === true
      };
    }).sort(function (a, b) { return Date.parse(a.date) - Date.parse(b.date); });
    var measured = inMonth.filter(function (session) { return session.hasLearnerEvidence; });
    var totalWords = measured.reduce(function (sum, session) { return sum + session.totalWords; }, 0);
    var current = seoulParts(now || new Date());
    return {
      monthLabel: current ? Number(current.month) + '월' : '이번 달',
      sessions: measured,
      recordedSessionCount: inMonth.length,
      totalWords: totalWords,
      insight: monthlyInsight(measured)
    };
  }

  function formatNumber(value) {
    try { return Number(value || 0).toLocaleString('ko-KR'); } catch (e) { return String(value || 0); }
  }

  function barButton(value, max, label, tooltip) {
    var ratio = max > 0 ? value / max : 0;
    var height = value > 0 ? Math.max(12, Math.round(ratio * 100)) : 6;
    return '<button type="button" class="dayo-story-bar" style="--dayo-bar-height:' + height + '%" aria-label="' +
      escapeHtml(tooltip) + '" aria-expanded="false"><span class="dayo-story-bar__fill" aria-hidden="true"></span>' +
      '<span class="dayo-story-tooltip" role="tooltip">' + escapeHtml(tooltip) + '</span>' +
      '<span class="dayo-story-bar__label" aria-hidden="true">' + escapeHtml(label) + '</span></button>';
  }

  function rhythmHtml(metrics) {
    var bins = metrics.bins;
    var max = Math.max.apply(Math, bins.concat([1]));
    return '<div class="dayo-story-chart dayo-story-chart--rhythm" aria-label="25분 동안 내가 말한 단어의 흐름">' +
      bins.map(function (value, index) {
        var from = index * 5;
        var to = from + 5;
        return barButton(value, max, from + '–' + to, from + '–' + to + '분 · ' + formatNumber(value) + '단어');
      }).join('') + '</div>';
  }

  function sessionCardHtml(metrics) {
    if (!metrics || !metrics.hasLearnerEvidence) {
      return '<section class="dayo-conversation-story dayo-conversation-story--empty" aria-label="오늘의 대화 패턴">' +
        '<p class="dayo-conversation-story__eyebrow">오늘의 대화 패턴</p>' +
        '<h3>대화 기록은 그대로 남아 있어요.</h3>' +
        '<p>이번 대화에서는 집계할 수 있는 유저 발화가 충분하지 않았어요.</p></section>';
    }
    return '<section class="dayo-conversation-story" aria-label="오늘의 대화 패턴">' +
      '<p class="dayo-conversation-story__eyebrow">오늘의 대화 패턴</p>' +
      '<h3>오늘 <strong>' + formatNumber(metrics.totalWords) + '단어</strong>를 이야기했어요.</h3>' +
      (metrics.averageWords == null ? '' : '<p class="dayo-conversation-story__average">한 번 말할 때 평균 ' + escapeHtml(metrics.averageWords) + '단어</p>') +
      (metrics.hasTimedEvidence ? rhythmHtml(metrics) : '<p class="dayo-conversation-story__unavailable">시간대별 리듬을 만들 수 있는 기록이 없어요.</p>') +
      '<p class="dayo-conversation-story__insight">' + escapeHtml(sessionInsight(metrics)) + '</p></section>';
  }

  function monthlyHeroHtml(summary) {
    var sessions = summary.sessions || [];
    if (!sessions.length) {
      var hasUnmeasured = summary.recordedSessionCount > 0;
      return '<section class="dayo-monthly-story dayo-monthly-story--empty" aria-labelledby="dayo-monthly-story-title">' +
        '<p class="dayo-monthly-story__eyebrow">이번 달의 대화</p>' +
        '<h2 id="dayo-monthly-story-title">' + (hasUnmeasured ? '대화 경험이 차곡차곡 쌓이고 있어요.' : '첫 대화를 기다리고 있어요.') + '</h2>' +
        '<p>' + (hasUnmeasured ? '저장된 대화는 있지만 유저 발화량을 계산할 수 있는 기록이 없어요.' : '첫 대화를 시작하면 나만의 대화 흐름이 여기에 쌓여요.') + '</p>' +
        (hasUnmeasured ? '' : '<button type="button" class="dayo-monthly-story__cta" data-dayo-booking-cta>첫 대화 예약하기</button>') +
        '</section>';
    }
    var recent = sessions.slice(-8);
    var max = Math.max.apply(Math, recent.map(function (session) { return session.totalWords; }).concat([1]));
    return '<section class="dayo-monthly-story" aria-labelledby="dayo-monthly-story-title">' +
      '<p class="dayo-monthly-story__eyebrow">이번 달의 대화</p>' +
      '<h2 id="dayo-monthly-story-title">' + escapeHtml(summary.monthLabel) + '에는<br><strong>' + formatNumber(summary.totalWords) + '단어</strong>를 이야기했어요.</h2>' +
      '<p class="dayo-monthly-story__support">이번 달 ' + sessions.length + '번의 대화를 실제 사람들과 쌓았어요.</p>' +
      '<div class="dayo-monthly-story__visual" aria-label="이번 달 최근 대화의 단어 흐름">' +
        recent.map(function (session) {
          return barButton(session.totalWords, max, session.label, session.label + ' · ' + formatNumber(session.totalWords) + '단어');
        }).join('') +
      '</div><p class="dayo-monthly-story__insight">' + escapeHtml(summary.insight) + '</p></section>';
  }

  function bindChartInteractions(container) {
    if (!container || container.__dayoStoryBound) return;
    container.__dayoStoryBound = true;
    container.addEventListener('click', function (event) {
      var button = event.target.closest && event.target.closest('.dayo-story-bar');
      container.querySelectorAll('.dayo-story-bar.is-detail-open').forEach(function (node) {
        if (node !== button) {
          node.classList.remove('is-detail-open');
          node.setAttribute('aria-expanded', 'false');
        }
      });
      if (!button) return;
      var open = !button.classList.contains('is-detail-open');
      button.classList.toggle('is-detail-open', open);
      button.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    container.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return;
      container.querySelectorAll('.dayo-story-bar.is-detail-open').forEach(function (node) {
        node.classList.remove('is-detail-open');
        node.setAttribute('aria-expanded', 'false');
      });
    });
  }

  function transcriptRows(root) {
    if (Array.isArray(root.sessionTranscript) && root.sessionTranscript.length) return root.sessionTranscript;
    if (root.DayOLive && typeof root.DayOLive.getTranscript === 'function') {
      try {
        var liveRows = root.DayOLive.getTranscript();
        if (Array.isArray(liveRows) && liveRows.length) return liveRows;
      } catch (e) { /* use remaining evidence */ }
    }
    if (Array.isArray(root.DayOLastTranscript)) return root.DayOLastTranscript;
    return [];
  }

  function renderCurrentTalkRecord(root) {
    var box = root.document.getElementById('quiz-content-box');
    if (!box || box.querySelector('.dayo-recap') || box.querySelector('.dayo-conversation-story')) return;
    var access = root.DayORoomAccess || {};
    if (access.role && access.role !== 'user' && access.role !== 'admin') return;
    var metrics = analyzeSession(transcriptRows(root), access.scheduledAt || '');
    var anchor = null;
    box.querySelectorAll('.talk-record-row').forEach(function (row) {
      var label = row.querySelector('.talk-record-label');
      if (label && /대표 문장|핵심 표현/.test(label.textContent || '')) anchor = row;
    });
    if (anchor) anchor.insertAdjacentHTML('afterend', sessionCardHtml(metrics));
    else box.insertAdjacentHTML('afterbegin', sessionCardHtml(metrics));
    bindChartInteractions(box);
  }

  function initTalkRecord(root) {
    var modal = root.document.getElementById('quiz-modal');
    if (!modal || typeof MutationObserver === 'undefined') return;
    var observer = new MutationObserver(function () {
      if (!modal.hidden || modal.classList.contains('is-open')) renderCurrentTalkRecord(root);
    });
    observer.observe(modal, { attributes: true, attributeFilter: ['hidden', 'class', 'style'] });
  }

  function uuid(value) {
    var raw = String(value || '');
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw) ? raw : '';
  }

  function canonicalLearnerLogsByBooking(rows, userId) {
    var result = {};
    (Array.isArray(rows) ? rows : []).forEach(function (row) {
      if (!row || row.participant_role !== 'learner' || String(row.participant_id || '') !== String(userId || '')) return;
      var id = uuid(row.booking_id);
      if (!id || result[id]) return;
      result[id] = row;
    });
    return result;
  }

  async function loadMonthlyData(root, reports) {
    var host = root.document.getElementById('dayo-monthly-story-host');
    if (!host) return;
    var client = root.supabaseClient;
    if (!client || !client.auth) {
      host.innerHTML = monthlyHeroHtml(summarizeMonth([], new Date()));
      return;
    }
    var auth = await client.auth.getUser();
    var user = auth && auth.data && auth.data.user;
    if (!user) {
      host.innerHTML = monthlyHeroHtml(summarizeMonth([], new Date()));
      return;
    }
    var reportIds = (Array.isArray(reports) ? reports : []).map(function (report) {
      return uuid(report && report.booking_id);
    }).filter(Boolean);
    var bounds = seoulMonthBounds(new Date());
    var monthBookingResult = bounds ? await client.from('bookings')
      .select('id, scheduled_at, status').eq('is_test_session', false)
      .eq('learner_id', user.id)
      .in('status', ['completed', 'done', 'finished'])
      .gte('scheduled_at', bounds.start)
      .lt('scheduled_at', bounds.end)
      .order('scheduled_at', { ascending: true }) : { data: [], error: null };
    var monthBookings = monthBookingResult && !monthBookingResult.error ? (monthBookingResult.data || []) : [];
    var reportBookingResult = reportIds.length ? await client.from('bookings')
      .select('id, scheduled_at, status')
      .eq('learner_id', user.id)
      .in('id', reportIds)
      .limit(200) : { data: [], error: null };
    var reportBookings = reportBookingResult && !reportBookingResult.error ? (reportBookingResult.data || []) : [];
    var bookingsById = {};
    monthBookings.concat(reportBookings).forEach(function (booking) {
      var id = uuid(booking && booking.id);
      if (id) bookingsById[id] = booking;
    });
    var seenIds = {};
    var ids = Object.keys(bookingsById).filter(function (id) {
      if (!id || seenIds[id]) return false;
      seenIds[id] = true;
      return true;
    });
    if (!ids.length) {
      host.innerHTML = monthlyHeroHtml(summarizeMonth([], new Date()));
      bindChartInteractions(host);
      return;
    }
    var logQuery = client.from('session_logs')
      .select('id, booking_id, participant_id, participant_role, transcript')
      .eq('participant_id', user.id)
      .eq('participant_role', 'learner')
      .in('booking_id', ids)
      .limit(200);
    var logResult = await logQuery;
    if (logResult.error) {
      console.warn('[DayO] conversation insight logs unavailable', logResult.error);
      host.innerHTML = monthlyHeroHtml({ monthLabel: summarizeMonth([], new Date()).monthLabel, sessions: [], recordedSessionCount: monthBookings.length, totalWords: 0 });
      return;
    }
    var logs = canonicalLearnerLogsByBooking(logResult.data || [], user.id);
    (Array.isArray(reports) ? reports : []).forEach(function (report) {
      var id = uuid(report && report.booking_id);
      var log = logs[id];
      var booking = bookingsById[id];
      if (!id || !booking || !log || !Array.isArray(log.transcript)) return;
      var metrics = analyzeSession(log.transcript, booking.scheduled_at);
      report.__dayoConversationMetrics = metrics;
      // Already constrained by authenticated participant_id and learner role.
      report.__dayoLearnerTranscript = log.transcript.filter(isLearnerRow);
      report.__dayoLearnerSourceLogId = log.id;
    });
    // A detail opened before the authenticated log arrived must gain the same
    // evidence as one opened later. Refresh only that booking, without reopening.
    var openDetail = root.document.querySelector('.ucr-detail[data-booking-id]');
    var detailBody = root.document.getElementById('report-detail-body');
    if (openDetail && detailBody && typeof root.renderReportDetailHtml === 'function') {
      var openReport = (reports || []).find(function (report) {
        return report.booking_id === openDetail.getAttribute('data-booking-id');
      });
      if (openReport) {
        var panel = detailBody.closest('.report-detail-panel');
        var scrollTop = panel ? panel.scrollTop : 0;
        detailBody.innerHTML = root.renderReportDetailHtml(openReport);
        if (panel) panel.scrollTop = scrollTop;
      }
    }
    var sessions = monthBookings.map(function (booking) {
      var log = logs[String(booking.id)];
      if (!log || !Array.isArray(log.transcript)) return null;
      return { id: booking.id, date: booking.scheduled_at, metrics: analyzeSession(log.transcript, booking.scheduled_at) };
    }).filter(Boolean);
    var summary = summarizeMonth(sessions, new Date());
    summary.recordedSessionCount = monthBookings.length;
    host.innerHTML = monthlyHeroHtml(summary);
    bindChartInteractions(host);
  }

  function installReportDetail(root) {
    var original = root.renderReportDetailHtml;
    if (typeof original !== 'function' || original.__dayoInsightsWrapped) return;
    var wrapped = function (report) {
      var html = original(report);
      if (html.indexOf('class="dayo-recap"') !== -1) return html;
      if (!report || !report.__dayoConversationMetrics) return html;
      if (html.indexOf('<div data-dayo-report-metrics></div>') !== -1) {
        return html.replace('<div data-dayo-report-metrics></div>', sessionCardHtml(report.__dayoConversationMetrics));
      }
      return html.replace('<div class="insta-card-export-wrap"', sessionCardHtml(report.__dayoConversationMetrics) + '<div class="insta-card-export-wrap"');
    };
    wrapped.__dayoInsightsWrapped = true;
    root.renderReportDetailHtml = wrapped;
  }

  function initMyPage(root) {
    var progress = root.document.getElementById('speaking-progress-card');
    if (!progress || root.document.getElementById('dayo-monthly-story-host')) return;
    var host = root.document.createElement('div');
    host.id = 'dayo-monthly-story-host';
    host.setAttribute('aria-live', 'polite');
    host.innerHTML = '<section class="dayo-monthly-story dayo-monthly-story--loading"><p>이번 달의 대화를 불러오고 있어요…</p></section>';
    progress.parentNode.insertBefore(host, progress);
    installReportDetail(root);
    root.document.addEventListener('dayo:reportsloaded', function (event) {
      loadMonthlyData(root, event && event.detail && event.detail.reports || []).catch(function (error) {
        console.warn('[DayO] monthly conversation insight failed', error);
        host.innerHTML = monthlyHeroHtml({ monthLabel: summarizeMonth([], new Date()).monthLabel, sessions: [], recordedSessionCount: 0, totalWords: 0 });
      });
    });
    host.addEventListener('click', function (event) {
      var cta = event.target.closest && event.target.closest('[data-dayo-booking-cta]');
      if (cta && typeof root.openBookingModal === 'function') root.openBookingModal();
    });
  }

  function boot(root) {
    function ready() {
      bindChartInteractions(root.document);
      initTalkRecord(root);
      initMyPage(root);
    }
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', ready, { once: true });
    else ready();
  }

  return {
    analyzeSession: analyzeSession,
    sessionInsight: sessionInsight,
    summarizeMonth: summarizeMonth,
    monthlyInsight: monthlyInsight,
    sessionCardHtml: sessionCardHtml,
    monthlyHeroHtml: monthlyHeroHtml,
    bindChartInteractions: bindChartInteractions,
    isLearnerRow: isLearnerRow,
    englishWords: englishWords,
    canonicalLearnerLogsByBooking: canonicalLearnerLogsByBooking,
    boot: boot
  };
});
