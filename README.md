# 💳 PayFlow — Secure Payment Gateway

> A professional payment processing interface with Stripe integration, transaction history, and animated feedback.

**Live Demo:** [payflow-gateway.vercel.app](https://payflow-gateway.vercel.app)

---

## ✨ Features

- 🎭 **Demo Mode** — Simulate successful or failed payments instantly (no real card needed)
- 💳 **Stripe Mode** — Real Stripe card form with brand detection (Visa/Mastercard/Amex)
- ⚡ **Processing Animation** — Step-by-step progress indicators
- ✅ **Animated Success** — SVG checkmark animation with confetti on payment success
- ❌ **Failure Recovery** — Actionable error page with retry flow
- 📊 **Transaction History** — Full table of all processed payments

## 🛠️ Tech Stack

| Layer       | Technology                    |
|-------------|-------------------------------|
| Framework   | Angular 17 (Standalone Components) |
| Styling     | SCSS (Clean Tech Cyan Theme)  |
| Payments    | Stripe.js v3                  |
| HTTP        | Angular HttpClient            |
| State       | Angular Signals               |
| Deployment  | Vercel                        |

## 🚀 Quick Start

```bash
npm install
npm start
# → http://localhost:4201
```

## 🧪 Test Cards (Stripe)

| Card Number         | Result  |
|--------------------|---------|
| 4242 4242 4242 4242 | ✅ Success |
| 4000 0000 0000 0002 | ❌ Decline |

Use any future date + any 3-digit CVV.

## 💡 How It Connects

```
StayEase Checkout → ?booking_id=123&ref=BK12345678
       ↓
PayFlow shows order summary
       ↓
User pays (mock or Stripe)
       ↓
POST /payments/payment-success → booking confirmed
       ↓
Redirect back to StayEase
```

---

*Built by Athitthiyan — Portfolio 2026*
