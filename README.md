<div align="center">

# PayFlow

Stayvora's payment experience — Stripe checkout, booking confirmation, retry recovery, and transaction history.

[![Angular](https://img.shields.io/badge/Angular-17-DD0031?logo=angular&logoColor=white)](https://angular.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vercel](https://img.shields.io/badge/Deployed-Vercel-000000?logo=vercel&logoColor=white)](https://vercel.com/)
[![CI](https://github.com/athitthiyan/payflow-payment-app/actions/workflows/ci.yml/badge.svg)](https://github.com/athitthiyan/payflow-payment-app/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

**Live App:** [pay.stayvora.co.in](https://pay.stayvora.co.in) | **Platform:** [stayvora.co.in](https://stayvora.co.in)

</div>

---

## About

**PayFlow** is the dedicated payment frontend of the Stayvora platform. When a guest proceeds to checkout from the booking app, they are handed off to PayFlow for secure Stripe card processing, payment confirmation, and post-payment state management. It handles retries, abandoned-session recovery, hold-timer countdowns, and transaction history.

## Features

- Stripe card checkout with secure payment intent creation
- Booking-aware payment confirmation and retry recovery
- Hold timer support for pending reservations
- Processing state with confirmation polling
- Success and failure flows tied to booking state
- Transaction history for payment tracking

## Tech Stack

| Layer | Technology |
| --- | --- |
| Framework | Angular 17 standalone components |
| Language | TypeScript strict mode |
| Styling | SCSS |
| Payments | Stripe.js v3 |
| State | Angular Signals |
| HTTP | Angular HttpClient |
| Deployment | Vercel |

## Quick Start

### Prerequisites

- Node.js 18+
- npm 9+

### Setup

```bash
git clone https://github.com/athitthiyan/payflow-payment-app.git
cd payflow-payment-app
npm install
npm start
```

The dev server runs at [http://localhost:4201](http://localhost:4201).

## Stripe Test Cards

| Card Number | Result |
| --- | --- |
| 4242 4242 4242 4242 | Success |
| 4000 0000 0000 0002 | Decline |

Use any future expiry date and any 3-digit CVV.

## Flow

```text
Stayvora Checkout -> PayFlow
                    |
                    -> Stripe payment confirmation
                    -> HotelAPI booking finalization
                    -> Stayvora booking confirmation page
```

## Connected Apps

| App | Repository | Purpose |
| --- | --- | --- |
| Stayvora Booking | [athitthiyan/stayease-booking-app](https://github.com/athitthiyan/StayVora) | Guest-facing booking frontend |
| InsightBoard | [athitthiyan/insightboard-admin](https://github.com/athitthiyan/insightboard-admin) | Admin analytics dashboard |
| HotelAPI | [athitthiyan/hotelapi-backend](https://github.com/athitthiyan/hotelapi-backend) | Shared backend API |
| Partner Portal | [athitthiyan/partner-portal](https://github.com/athitthiyan/partner-portal) | Hotel-partner operations |

## Contributing

Contributions are welcome — bug reports, feature ideas, and pull requests. See [CONTRIBUTING.md](CONTRIBUTING.md) and please follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

This project is licensed under the [MIT License](LICENSE).
