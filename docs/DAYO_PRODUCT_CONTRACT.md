# DayO Product Contract — Owner-Approved Behavior

**Purpose:** this is a standing product-behavior contract, NOT permission to implement every feature below in the current task. It protects intentional user experience against accidental rewrites. Check only relevant sections per task. **The newest explicit owner decision overrides a contradictory old document; report the conflict before changing code.**

## A. Service identity and journey

- DayO (돼요) is a **guided, scheduled, moderated 1:1 global conversation service**, not formal lessons, private tutoring, an open dating/social chat app, or a random-call service.
- Customer journey: browse a suitable Partner/slot → book → prepare a conversation topic and Talk Cards → **25 minutes of real live conversation** → **5 minutes of follow-up/quiz** → Recap, Partner Letter and optional keepsake.
- An upcoming service/capability is not automatically live or purchasable. Do not advertise nonexistent inventory.
- Preserve exact currently authorized prices, packages, booking and cancellation semantics. Never infer a price change from a copy/UX task.
- Initial new-customer language focus is **English, Korean, Spanish**; earlier French/other historical partner data and bookings must not be rewritten or erased. This is a product target, not a claim all three are currently fully enabled or inventory-backed. KO/EN site interface localization remains independent of conversation languages.
- After customer login, **Book a Conversation (대화 예약하기)** is the primary home CTA; the speaking-sense test is secondary and remains available. Do not alter the hero tagline or purchase UI in unrelated work.

## B. Live room — both mobile and desktop

- Partner and Learner have distinct authorized roles and user interfaces; only the proper role may invoke its actions. Observers/admin previews must not impersonate participants, affect payouts, or contaminate canonical evidence.
- Preserve video, microphone/camera, mute, remote audio recovery, reconnect, session timer, issue/safety reporting, and audio permission flow.
- **Partner controls the shared Talk Cards and Next Question**; card content is legible and scrollable. Mobile card/chat/panels must remain dismissible and must never trap or hide session controls.
- In-room chat: visible and sendable, paper-plane send icon with accessible label, persistent per-booking messages where implemented. Typed chat must be attributed separately from speech.
- **Live CC captions are essential and must never silently disappear.** Partner's English speech recognition is delivered to the Learner's live English caption view; CC toggle, two-line/approximately eight-second lifecycle, mobile layout and reconnect behavior remain intact. Existing captions are NOT automatically “replaced” by a paid STT pilot.
- Each participant's microphone has an independent STT stream and authenticated role identity. Do not silently mix microphone audio, mistake Partner speech for Learner speech, fabricate transcriptions, or change canonical session logs. Browser `en-US` STT is the current Production baseline until an authorized replacement is proven.
- A separate Soniox paid STT comparison may exist in protected Preview. It is **not Production by default**; must not change canonical transcripts, captions, quizzes, reports or Provider billing without separate approval.

## C. Partner post-conversation responsibilities — LOCKED OWNER DECISION

**Partner's actual responsibilities:** (1) write/send a short human Letter; (2) select an evidence-grounded conversation theme, generate/preview the optional watercolor keepsake, and **the SAME Partner explicitly approves “Send this image” or rejects “Don't use”**; (3) optionally leave a private operations note.

- The Partner is the **only required human image reviewer**. **DO NOT require Owner/Admin approval.** Optional Admin moderation is not an extra mandatory step.
- Never fabricate personalized Letter suggestions. Suggestions come from the exact booking's verified speech or saved chat, and Partner can always write without AI suggestions.
- Letter sending: no silent, indefinitely disabled buttons. Show checking/sending/saved/failure states, retain draft on failure, prevent double submits, distinguish unknown write outcome from confirmed failure, confirm exact saved text, and navigate to Partner Lounge reliably. A past valid Letter cannot be overwritten by retries.
- Image: select exact-booking theme → generate privately → preview exact image → send/reject. No auto-publish, invented topic, visible lettering/watermark, or cross-booking leakage. Max attempts and quotas remain enforced; if the image is not usable, the Letter and end flow must still work.
- **Optional private note to Operations:** a new requested capability, **not yet assumed deployed**. May describe technical friction or conversation issues without invoking formal safety/report/refund flows. Booking-owned Partner writes; admins only read; customer never sees it; note failures preserve draft and must not block Letter. Requires specific approval before any new storage/RPC migration. Do NOT use existing `report_session_tech_issue` (can affect booking/refund review) or widen Admin-only CS note permissions.
- Preserve existing TEST-session reward suppression and ordinary reward idempotency. No unintended ticket or payout changes.

## D. Customer post-conversation and Recap — LOCKED OWNER DECISION

- Conversation ends → optional Partner feedback FIRST → **one primary “피드백 보내고 리캡 시작” action** (no compulsory choices or confusing double primary buttons) → Recap → Word Quiz when grounded questions exist → My Page.
- Do not open Feedback as an overlay AFTER Recap has already opened. Saving optional feedback may fail without trapping the customer; show truthful state.
- Recap prioritizes: **Today's Stories**, **My Conversation Volume**, **Today's Word Quiz**, followed by genuine saved in-session chat where relevant. Interface stays compact and scrollable on mobile.
- Remove unsolicited “save Talk Card / save Recap card” CTAs from this immediate post-session view. Live Talk Cards remain untouched.
- Do not show a nonexistent Partner Letter, manual refresh CTA or blank “waiting for Partner” card in immediate Recap. Display the actual saved Letter only when present (especially in My Page).
- Quiz is important, not a disposable extra. Target **2/4/6 questions based on 1/2/3 eligible words**, with truthful progress, completion scores, replay and persistence. Vocabulary candidates may come from **verified Learner speech and permitted saved session chat** according to the existing contract, not invented Learner speech or random Partner oral utterances. Preserve the repeat-avoidance policy. If there is truly insufficient trustworthy vocabulary, **explain why instead of silently hiding an expected feature**; investigate unjustifiably frequent zero-question outputs without weakening integrity gates.
- `spoken_sentence` and “I said” quotes must be **actual authenticated Learner evidence only**. A chat, Partner Letter, Partner utterance, suggested example or topic is NOT proof the Learner spoke it. Confidence errors and profanity should not be passed through as reliable Learner quotes.
- A future chat-style transcript view may merge authorized participant logs by timestamp **only after consent, access-control design and separate approval**. It is not currently a required feature and must not be snuck into unrelated UI work.

## E. Illustration safety and current staged status

- Current provider is Cloudflare. Maintain private Storage, booking boundaries, explicit Partner publish/reject, quotas, bounded retries, cleanup and text-only fallback.
- Automated inspection may reject obvious unsafe/text-contaminated images; it is not reliable enough to auto-approve clean watercolor images from the current evidence. One Partner's deliberate review is the intended beta flow.
- Existing migrations 107–110 have been reported as applied (confirm live schema before any new migration). Migration 111 for Partner preview/approve was **prepared but NOT reported applied as of 2026-10-13**. Check current backend state, do not assume the date-stamped note stays current.
- The historic TEST booking has exhausted 2 image attempts; do not reset or regenerate it to make a demo pass.
- The Production illustration UI was deliberately `illustrationAvailable=false` until authorized real E2E release. Don't turn it on while essential access/publish checks remain unverified.

## F. Privacy, operations and customer trust

- Never expose another booking's transcript, private note, signed object path, Partner legal identity or credentials. **Partner public display name**, not unreviewed legal full name, is used customer-facing.
- Public sharing should be an **explicit customer action**, distinct from guessing links or unauthorized access. No broad security redesign without demonstrated need.
- Never change regulatory/employment assumptions about student Partners, labor, tax or product classification during coding tasks. If a change materially affects compliance, flag it for owner review; do not invent legal clearance.
- Preserve public site, Admin, payments, safety, tickets, registration, migrations and any currently dormant but intended features unless specifically authorized.