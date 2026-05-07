# Good First Issue Backlog — PayFlow

These are ready-to-create GitHub issues for the public contributor backlog. Apply the `good first issue` label to each one.

## Add Accessible Error Messages to Stripe Card Validation

The card number, expiry, and CVC fields currently show generic validation errors. Screen reader users need descriptive, associated error messages.

Acceptance criteria:
- Each Stripe card field has a linked `aria-describedby` error region.
- Error text appears on blur and on submit attempt.
- Verified manually with VoiceOver or NVDA, or via axe-core.

## Improve the Payment Processing Loading State

The "processing" screen between Stripe submission and confirmation polling has a basic spinner. A more informative state would reduce user anxiety.

Acceptance criteria:
- Add a multi-step indicator or descriptive copy explaining what is happening.
- The loading state is accessible (no spinning-only feedback).
- No regression to the confirmation or failure flows.

## Show a Clear "Contact Support" Path After Maximum Retries

When payment retries are exhausted, users see an error but have no path forward.

Acceptance criteria:
- After the final retry failure, surface a support email link (`support@stayvora.co.in`).
- Keep the existing retry counter and error messaging intact.
- Add a unit test for the retry-limit edge case.

## Document Local Stripe Webhook Forwarding

New contributors can't test end-to-end payment flows without forwarding Stripe webhooks locally. This is not documented anywhere.

Acceptance criteria:
- Add a "Local Stripe Webhook Setup" section to `CONTRIBUTING.md`.
- Cover `stripe listen --forward-to localhost:PORT/webhook`.
- Include the required environment variable for the webhook secret.

## Write Tests for Hold-Timer Expiry Flow

The hold-timer countdown and expiry redirect are critical flows but have no dedicated test coverage.

Acceptance criteria:
- Add a unit test for the timer-expiry side effect (redirect or state reset).
- Cover both natural expiry and user-triggered cancellation.
- No new external dependencies required.
