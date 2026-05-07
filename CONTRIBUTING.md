# Contributing to PayFlow

Thanks for helping improve PayFlow. This project welcomes bug reports, feature ideas, documentation fixes, and tests.

## Ways to Contribute

- Pick an issue labeled `good first issue` or `help wanted`.
- Report a bug with expected behavior, actual behavior, screenshots if useful, and reproduction steps.
- Suggest a feature by describing the payment problem it solves.
- Improve test coverage, accessibility, or documentation.

## Local Setup

```bash
npm install
npm start
```

The app runs at [http://localhost:4201](http://localhost:4201).

## Before Opening a Pull Request

```bash
npm run lint
npm test
npm run build
```

## Pull Request Guidelines

- Keep PRs focused on one behavior or improvement.
- Include screenshots for UI changes.
- Add or update tests when behavior changes.
- Describe any Stripe flow implications or environment variable changes.

## Good First Issue Ideas

- Add accessible error messages to Stripe card field validation.
- Improve the loading state UX during payment confirmation polling.
- Add retry-limit handling to show a clear "contact support" path.
- Write tests for the hold-timer expiry edge case.
- Document local Stripe webhook forwarding setup.
