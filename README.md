# PayFlow - Secure Payment App

PayFlow is Stayvora's payment experience for booking confirmation, retries, recovery, and transaction history.

**Live App:** [payflow-payment-app.vercel.app](https://payflow-payment-app.vercel.app)

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
| Framework | Angular 17 (standalone components) |
| Styling | SCSS |
| Payments | Stripe.js v3 |
| HTTP | Angular HttpClient |
| State | Angular Signals |
| Deployment | Vercel |

## Quick Start

```bash
npm install
npm start
# http://localhost:4201
```

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
                    -> Stayvora booking confirmation
```

Built for Stayvora payments.
