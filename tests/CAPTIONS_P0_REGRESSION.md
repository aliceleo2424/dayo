# Caption regression release gate

Normal room command: `node tests/production-room-regressions.test.js`.

The runner invokes both `partner-captions-fixtures.test.js` and
`partner-captions-browser.test.cjs` and fails if either fails. The browser gate
requires the existing Playwright runtime and installed Chrome; expose existing
test dependencies through NODE_PATH where they are not installed in the checkout.
It uses the existing official PeerJS 1.5.4 client and PeerJS signaling service.

Successful runner output includes:

```text
PASS: two browser contexts, real PeerJS media/data signaling; production final → User DOM, role isolation, CC, 8s expiry, reconnect, Cards/Chat and KO/EN 360/390/1280. No DB writes.
Production room regression fixtures passed: STT lifecycle/telemetry/preflight, connection retry/audio recovery, mobile Talk Card scroll, evidence-only Word Help, booking isolation, and zero-candidate recap UX.
```

The test loads actual room DOM/CSS and production PeerJS initialization/caption
rendering code, with synthetic media and final-result inputs. It verifies no
duplicate User transcript storage. It does not use actual microphones, real
authentication, bookings, DB writes or paid providers. Browser/viewport checks
are desktop contexts, not physical Android/iOS verification.

## Pre-existing AUDIO fixture failure

At baseline `d0f73cdcb3a673a705c2a02a94f1acf205b87807`, the independent command
`node tests/room-connection-i18n.test.cjs` fails:

```text
ReferenceError: audioDiagnostics is not defined
```

The fixture evaluates an extracted room recovery block without providing its
enclosing `audioDiagnostics` variable. Production declares that variable in the
room initialization closure. Neither this fixture nor production behavior was
changed by the caption-test integration. This is a known separate test-harness
failure, not evidence that the caption flow failed. Do not describe every suite
as passing; this failure remains unresolved.

## Incident status

Oct 11 caption incident: **OPEN**. The owner identified a Samsung Galaxy S23
using KakaoTalk. Actual browser versions, whether the room redirected into
Chrome, and physical-device caption delivery/rendering remain unverified.
Do not bypass the existing in-app-browser guard or claim this test-only release
fixes that incident. The privacy-safe diagnostic probe remains outside product
assets, prepared for separately authorized real-device verification.

This integration changes tests/documentation only. Preserve STT fix `d0f73cdc`
and all caption, WebRTC, UI, session and financial behavior.
