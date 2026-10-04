'use strict';

// Run from a trusted server/scheduler with the dedicated booking notification retry secret.
// Never put this credential in frontend code. Do not run as an external mail test.
async function retry() {
  const key = String(process.env.BOOKING_NOTIFICATION_RETRY_SECRET || '').trim();
  if (!key) throw new Error('BOOKING_NOTIFICATION_RETRY_SECRET is required in the trusted runner');
  const totals = { sent: 0, failed: 0, review: 0 };
  for (let batch = 0; batch < 10; batch += 1) {
    const response = await fetch('https://www.dayotalk.com/api/booking-notifications-retry', {
      method: 'POST', redirect: 'error',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: '{}', signal: AbortSignal.timeout(65000)
    });
    if (!response.ok) throw new Error('Notification worker request failed: HTTP ' + response.status);
    const counts = await response.json();
    for (const field of Object.keys(totals)) totals[field] += Number(counts[field]) || 0;
    if (!counts.sent && !counts.failed && !counts.review) break;
  }
  console.log('Booking notification retry counts:', JSON.stringify(totals));
}

if (require.main === module) retry().catch(error => {
  // Fixed error messages only; credentials and provider responses are never printed.
  console.error('Booking notification retry failed:', error && error.name === 'TimeoutError' ? 'request timed out' :
    /^Notification worker request failed: HTTP \d+$|^BOOKING_NOTIFICATION_RETRY_SECRET is required/.test(String(error.message)) ? error.message : 'request unavailable');
  process.exitCode = 1;
});

module.exports = { retry };
