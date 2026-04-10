import {
  AfterViewInit,
  Component,
  DestroyRef,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  inject,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { loadStripe, Stripe, StripeCardElement } from '@stripe/stripe-js';
import { firstValueFrom } from 'rxjs';
import { timeout } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PaymentCooldownDetail, PaymentService } from '../../core/services/payment.service';
import { environment } from '../../../environments/environment';

type PaymentStep = 'details' | 'processing';
type PaymentUiState = 'idle' | 'processing' | 'failed_retry' | 'success' | 'expired' | 'conflict';

interface RazorpayResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  handler: (response: RazorpayResponse) => void | Promise<void>;
  prefill?: { name?: string; email?: string; contact?: string; method?: string };
  theme?: { color?: string };
  modal?: { ondismiss?: () => void };
}

interface RazorpayFailedResponse {
  error: {
    code?: string;
    description?: string;
    source?: string;
    step?: string;
    reason?: string;
    metadata?: { order_id?: string; payment_id?: string };
  };
}

declare const Razorpay: new (options: RazorpayOptions) => {
  open(): void;
  on(event: string, callback: (response: RazorpayFailedResponse) => void): void;
};

interface PaymentRoomSummary {
  hotel_name?: string;
  image_url?: string;
  location?: string;
}

interface PaymentBookingSummary {
  booking_ref: string;
  total_amount: number;
  room_rate?: number;
  taxes?: number;
  service_fee?: number;
  status?: string;
  payment_status: string;
  lifecycle_state?: string;
  hold_expires_at?: string | null;
  room?: PaymentRoomSummary;
  check_in: string;
  check_out: string;
  nights: number;
}

interface PaymentErrorShape {
  status?: number;
  name?: string;
  error?: {
    detail?: string | PaymentCooldownDetail;
  };
}

@Component({
  selector: 'app-payment-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="payment-page">
      <div class="payment-page__bg">
        <div class="bg-orb bg-orb--1"></div>
        <div class="bg-orb bg-orb--2"></div>
        <div class="bg-grid"></div>
      </div>

      <div class="payment-page__inner">

        <!-- Left: Payment Form -->
        <div class="payment-form-wrap">
          <button class="back-link" type="button" (click)="goBackToBooking()">← Back to Booking</button>

          <!-- Hold timer banner (shown whenever hold is active and not yet succeeded) -->
          @if (holdSecondsLeft() > 0 && uiState() !== 'success') {
            <div class="hold-timer" [class.hold-timer--warning]="holdSecondsLeft() < 120">
              ⏳ Room reserved for {{ holdMinutes() }}:{{ holdSecondsPad() }}
            </div>
          }

          <!-- Expired state — replaces the payment form entirely -->
          @if (uiState() === 'expired') {
            <div class="state-block state-block--expired">
              <span class="state-block__icon">⏰</span>
              <h3>Your reservation has expired</h3>
              <p>The 10-minute hold on your room timed out. Please go back and search for available rooms.</p>
              <a [href]="bookingAppUrl" class="btn btn--primary">Find Available Rooms →</a>
            </div>
          }

          <!-- Conflict state — replaces the payment form entirely -->
          @if (uiState() === 'conflict') {
            <div class="state-block state-block--conflict">
              <span class="state-block__icon">⚠️</span>
              <h3>Dates No Longer Available</h3>
              <p>{{ cardError() }}</p>
              <a [href]="bookingAppUrl" class="btn btn--primary">Select New Dates →</a>
            </div>
          }

          @if (step() === 'details' && uiState() !== 'expired' && uiState() !== 'conflict') {

            <!-- Failed retry banner (shown above card form after a decline) -->
            @if (uiState() === 'failed_retry' && cardError()) {
              <div class="retry-banner">
                <span>⚠️</span>
                <div>
                  <p>{{ cardError() }}</p>
                  @if (retryCooldownSecondsLeft() > 0) {
                    <p class="retry-limit">Retry available in {{ retryCooldownMinutes() }}:{{ retryCooldownSecondsPad() }}. Your booking hold remains active while the timer runs.</p>
                  } @else if (retryCount() >= maxRetries) {
                    <p class="retry-limit">Payment retries are paused for security. Please try another card or retry after the countdown.</p>
                  }
                </div>
              </div>
            }

            <!-- Header -->
            <div class="pf-header">
              <div class="pf-header__badge">🔒 Secure Checkout</div>
              <h1 class="pf-header__title">Complete <span>Payment</span></h1>
              <p class="pf-header__sub">Your transaction is protected by 256-bit SSL encryption</p>
            </div>

            <!-- Booking load error -->
            @if (bookingLoadError()) {
              <div class="alert alert--error">
                ⚠️ {{ bookingLoadError() }}
                <button class="alert__retry" (click)="retryLoadBooking()">Retry</button>
              </div>
            }

            <div class="card-form">

              <!-- Payment Method Selection -->
              <div class="form-group">
                <p class="form-label">Payment Method</p>
                <div class="payment-methods">
                  @if (stripeEnabled) {
                    <button
                      class="payment-method-btn"
                      [class.active]="selectedPaymentMethod() === 'card'"
                      (click)="selectPaymentMethod('card')"
                      type="button"
                    >
                      <span class="payment-method-icon">💳</span>
                      <span class="payment-method-label">Card</span>
                      <span class="payment-method-sub">Stripe</span>
                    </button>
                  }
                  <button
                    class="payment-method-btn"
                    [class.active]="selectedPaymentMethod() === 'upi'"
                    (click)="selectPaymentMethod('upi')"
                    type="button"
                  >
                    <span class="payment-method-icon">🏦</span>
                    <span class="payment-method-label">Razorpay</span>
                    <span class="payment-method-sub">UPI / GPay / PhonePe</span>
                  </button>
                </div>
              </div>

              <!-- Stripe Card Form (shown only when Stripe is enabled and card is selected) -->
              @if (stripeEnabled && selectedPaymentMethod() === 'card') {
                <div class="form-group">
                  <label for="cardholder-name">Cardholder Name</label>
                  <input
                    id="cardholder-name"
                    type="text"
                    [(ngModel)]="cardholderName"
                    name="cardholderName"
                    class="form-control"
                    placeholder="John Doe"
                  />
                </div>

                <div class="form-group" style="margin-top:16px">
                  <span id="card-details-label" class="form-label">Card Details</span>
                  <div
                    #cardMount
                    class="stripe-card-mount"
                    role="group"
                    aria-labelledby="card-details-label"
                  ></div>
                </div>

                @if (cardError() && uiState() !== 'failed_retry') {
                  <div class="card-error">⚠️ {{ cardError() }}</div>
                }

                <div class="test-cards-info">
                  Your payment is processed securely with Stripe. Card details are encrypted and handled using bank-grade checkout controls.
                </div>

                <button
                  class="btn btn--primary pay-btn"
                  (click)="processCardPayment()"
                  [disabled]="processing() || retryCooldownSecondsLeft() > 0 || !stripeReady() || !cardElementReady() || !bookingAmount()"
                >
                  @if (processing()) {
                    <span class="spinner-inline"></span> Processing…
                  } @else if (retryCooldownSecondsLeft() > 0) {
                    Retry available in {{ retryCooldownMinutes() }}:{{ retryCooldownSecondsPad() }}
                  } @else if (!stripeReady()) {
                    Loading payment system…
                  } @else if (!cardElementReady()) {
                    Preparing secure card form…
                  } @else if (!bookingAmount()) {
                    Loading booking…
                  } @else {
                    Pay ₹{{ bookingAmount() | number:'1.0-0' }} Securely 🔒
                  }
                </button>
              }

              <!-- Razorpay Payment (shown for UPI/GPay/PhonePe) -->
              @if (selectedPaymentMethod() !== 'card') {
                @if (cardError()) {
                  <div class="card-error">⚠️ {{ cardError() }}</div>
                }

                <div class="test-cards-info">
                  Your payment is processed securely with Razorpay. You can pay via UPI, Google Pay, or PhonePe.
                </div>

                <button
                  class="btn btn--primary pay-btn"
                  (click)="payWithRazorpay(selectedPaymentMethod())"
                  [disabled]="processing() || retryCooldownSecondsLeft() > 0 || !bookingAmount() || holdSecondsLeft() <= 0"
                >
                  @if (processing()) {
                    <span class="spinner-inline"></span> Processing…
                  } @else if (retryCooldownSecondsLeft() > 0) {
                    Retry available in {{ retryCooldownMinutes() }}:{{ retryCooldownSecondsPad() }}
                  } @else if (!bookingAmount()) {
                    Loading booking…
                  } @else if (holdSecondsLeft() <= 0) {
                    Booking hold expired
                  } @else {
                    Pay ₹{{ bookingAmount() | number:'1.0-0' }} with Razorpay 🔒
                  }
                </button>
              }

              <!-- Actions removed — user completes or abandons via booking app -->
              @if (actionMessage()) {
                <div class="action-message action-message--success">{{ actionMessage() }}</div>
              }
            </div>

            <!-- Trust Footer -->
            <div class="pf-trust">
              <span>SSL Encrypted</span>
              <span>PCI DSS Compliant</span>
              <span>Bank-level Security</span>
            </div>
          }

          <!-- ─── Processing State ─────────────────────────────────────── -->
          @if (step() === 'processing') {
            <div class="processing-state" aria-live="polite" aria-label="Payment processing status">
              <div class="processing-state__spinner">
                <div class="spinner-ring"></div>
                <span>💳</span>
              </div>
              <h2>Processing Payment…</h2>
              <p>Please wait while we securely process your payment.</p>
              <div class="processing-steps" aria-label="Payment processing steps">
                @for (s of processingSteps; track s.label; let i = $index) {
                  <div
                    class="processing-step"
                    [class.active]="processingStepIdx() === i"
                    [class.done]="processingStepIdx() > i"
                  >
                    <span class="processing-step__icon">
                      {{ processingStepIdx() > i ? '✅' : (processingStepIdx() === i ? '⏳' : '○') }}
                    </span>
                    <span>{{ s.label }}</span>
                  </div>
                }
              </div>
            </div>
          }

        </div>

        <!-- Right: Order Summary -->
        <aside class="payment-summary">
          <div class="payment-summary__card">
            <h3>Order Summary</h3>
            <div class="divider"></div>

            @if (booking()) {
              <div class="payment-summary__room">
                <span class="payment-summary__room-label">Hotel</span>
                <strong>{{ booking()?.room?.hotel_name || 'Premium Room' }}</strong>
                <span class="payment-summary__room-loc">{{ booking()?.room?.location || '' }}</span>
              </div>

              <div class="payment-summary__dates">
                <div>
                  <span>Check-in</span>
                  <strong>{{ booking()?.check_in | date:'MMM d, yyyy' }}</strong>
                </div>
                <div class="payment-summary__nights">
                  <span>{{ booking()?.nights }}</span>
                  <span>nights</span>
                </div>
                <div>
                  <span>Check-out</span>
                  <strong>{{ booking()?.check_out | date:'MMM d, yyyy' }}</strong>
                </div>
              </div>
            } @else {
              <div class="payment-summary__room">
                <span class="payment-summary__room-label">Booking</span>
                <strong>#{{ bookingRef() }}</strong>
              </div>
            }

            <div class="divider"></div>

            <div class="payment-summary__amount">
              <div class="amount-row">
                <span>Subtotal</span>
                <span>₹{{ booking()?.room_rate | number:'1.0-0' }}</span>
              </div>
              <div class="amount-row">
                <span>Taxes & Fees</span>
                <span>₹{{ (booking()?.taxes || 0) + (booking()?.service_fee || 0) | number:'1.0-0' }}</span>
              </div>
              <div class="divider"></div>
              <div class="amount-row amount-row--total">
                <span>Total Due</span>
                <span class="amount-total">₹{{ bookingAmount() | number:'1.0-0' }}</span>
              </div>
            </div>

            <div class="payment-summary__security">
              <div class="security-item">🔒 256-bit SSL encryption</div>
              <div class="security-item">✅ PCI DSS compliant</div>
              <div class="security-item">🔄 Free cancellation (48h)</div>
            </div>
          </div>
        </aside>

      </div>
    </div>
  `,
  styles: [`
    .payment-page {
      position: relative;
      min-height: 100vh;
      padding-top: 72px;
      display: flex;
      align-items: center;
    }

    .payment-page__bg {
      position: fixed;
      inset: 0;
      background: var(--sv-gradient);
      z-index: -1;
      overflow: hidden;
    }

    .payment-page__inner {
      width: 100%;
      max-width: 1100px;
      margin: 0 auto;
      padding: clamp(16px, 5vw, 48px) var(--layout-padding-x);
      display: grid;
      grid-template-columns: 1fr 380px;
      gap: clamp(20px, 4vw, 40px);
      align-items: start;
    }

    @media (max-width: 1024px) {
      .payment-page__inner {
        grid-template-columns: 1fr;
        gap: clamp(16px, 3vw, 32px);
      }
    }

    @media (max-width: 640px) {
      .payment-page__inner {
        padding: clamp(12px, 4vw, 20px) var(--layout-padding-x);
        gap: clamp(12px, 2vw, 20px);
      }
    }

    .bg-orb {
      position: absolute;
      border-radius: 50%;
      filter: blur(80px);
      pointer-events: none;
    }

    .bg-orb--1 {
      width: 500px; height: 500px;
      background: rgba(34,211,238,0.04);
      top: -100px; right: -100px;
      animation: float 8s ease-in-out infinite;
    }

    .bg-orb--2 {
      width: 400px; height: 400px;
      background: rgba(34,197,94,0.03);
      bottom: -100px; left: -80px;
      animation: float 10s ease-in-out infinite 3s;
    }

    @keyframes float {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-20px); }
    }

    .bg-grid {
      position: absolute;
      inset: 0;
      background-image:
        linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px);
      background-size: 50px 50px;
    }

    /* Header */
    .pf-header { margin-bottom: clamp(16px, 4vw, 32px); animation: fadeInUp 0.5s ease; }

    .back-link {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin-bottom: clamp(12px, 3vw, 18px);
      padding: 0;
      border: 0;
      background: transparent;
      color: var(--sv-text-muted);
      font: inherit;
      font-weight: 700;
      cursor: pointer;
      transition: color 0.2s, transform 0.2s;
      font-size: clamp(13px, 2vw, 14px);
    }

    .back-link:hover {
      color: var(--sv-primary);
      transform: translateX(-2px);
    }

    .pf-header__badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(34,211,238,0.1);
      border: 1px solid rgba(34,211,238,0.2);
      color: var(--sv-primary);
      padding: 6px 14px;
      border-radius: 99px;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 1px;
      margin-bottom: 16px;
    }

    .pf-header__title {
      font-family: 'Space Grotesk', sans-serif;
      font-size: clamp(1.5rem, 5vw, 3rem);
      font-weight: 700;
      color: white;
      margin-bottom: clamp(6px, 2vw, 8px);
      word-wrap: break-word;
      overflow-wrap: break-word;
    }

    .pf-header__title span { color: var(--sv-primary); }
    .pf-header__sub { font-size: clamp(12px, 2.5vw, 14px); color: var(--sv-text-muted); }

    /* Alert */
    .alert {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 14px 18px;
      border-radius: 10px;
      font-size: 14px;
      margin-bottom: 20px;
    }

    .alert--error {
      background: rgba(239,68,68,0.08);
      border: 1px solid rgba(239,68,68,0.25);
      color: #fca5a5;
    }

    .alert__retry {
      background: rgba(239,68,68,0.15);
      border: 1px solid rgba(239,68,68,0.3);
      color: #f87171;
      padding: 4px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      flex-shrink: 0;
    }

    /* Card Form */
    .card-form { animation: fadeInUp 0.4s ease; }

    /* Stripe Card Mount */
    .stripe-card-mount {
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 10px;
      padding: 16px;
      transition: border-color 0.2s;
    }

    .stripe-card-mount:focus-within {
      border-color: rgba(34,211,238,0.4);
      box-shadow: 0 0 0 3px rgba(34,211,238,0.08);
    }

    .card-error {
      margin-top: 12px;
      padding: 12px 16px;
      background: rgba(239,68,68,0.08);
      border: 1px solid rgba(239,68,68,0.25);
      border-radius: 8px;
      color: #fca5a5;
      font-size: 13px;
    }

    .test-cards-info {
      background: linear-gradient(180deg, rgba(59,130,246,0.12), rgba(34,211,238,0.06));
      border: 1px solid rgba(96,165,250,0.24);
      border-radius: var(--radius-md);
      padding: 14px 16px;
      margin-top: 16px;
      font-size: 12px;
      color: #c7d7f5;
      line-height: 1.7;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
    }

    .pay-btn {
      width: 100%;
      margin-top: 20px;
      padding: 18px;
      font-size: 16px;
      font-weight: 800;
      border: 1px solid rgba(96,165,250,0.28);
      background: linear-gradient(135deg, #60a5fa, #22d3ee);
      color: #04111f;
      box-shadow:
        0 18px 34px rgba(14,165,233,0.22),
        inset 0 1px 0 rgba(255,255,255,0.18);
    }

    .pay-btn:disabled {
      cursor: not-allowed;
      opacity: 1;
      background: linear-gradient(135deg, rgba(71,85,105,0.92), rgba(30,41,59,0.96));
      color: rgba(226,232,240,0.9);
      border-color: rgba(148,163,184,0.18);
      box-shadow:
        0 14px 28px rgba(2,6,23,0.28),
        inset 0 1px 0 rgba(255,255,255,0.06);
    }

    .payment-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-top: 14px;
    }

    .btn--ghost,
    .btn--danger {
      border-radius: var(--radius-md);
      padding: 14px 18px;
      font-weight: 800;
      cursor: pointer;
      transition: border-color 0.2s, color 0.2s, background 0.2s;
    }

    .btn--ghost {
      border: 1px solid rgba(34,211,238,0.28);
      background: rgba(34,211,238,0.06);
      color: var(--sv-primary);
    }

    .btn--danger {
      border: 1px solid rgba(248,113,113,0.35);
      background: rgba(239,68,68,0.08);
      color: #fca5a5;
    }

    .btn--danger:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }

    .action-message {
      margin-top: 12px;
      padding: 12px 16px;
      border-radius: var(--radius-md);
      font-size: 13px;
      font-weight: 700;
    }

    .action-message--success {
      background: rgba(34,197,94,0.08);
      border: 1px solid rgba(34,197,94,0.22);
      color: #86efac;
    }

    @media (max-width: 640px) {
      .payment-actions { grid-template-columns: 1fr; }
    }

    /* Trust */
    .pf-trust {
      display: flex;
      gap: 20px;
      justify-content: center;
      flex-wrap: wrap;
      margin-top: 24px;
      padding-top: 20px;
      border-top: 1px solid var(--sv-border);
    }

    .pf-trust span { font-size: 12px; color: var(--sv-text-muted); font-weight: 500; }

    /* Processing */
    .processing-state {
      text-align: center;
      padding: clamp(30px, 6vw, 60px) var(--layout-padding-x);
      animation: fadeInUp 0.5s ease;
    }

    .processing-state h2 {
      font-family: 'Space Grotesk', sans-serif;
      font-size: 1.8rem;
      color: white;
      margin-bottom: 8px;
    }

    .processing-state p { font-size: 15px; color: var(--sv-text-muted); margin-bottom: 32px; }

    .processing-state__spinner {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 32px;
    }

    .processing-state__spinner span { font-size: 2.5rem; z-index: 1; }

    .spinner-ring {
      position: absolute;
      width: 80px;
      height: 80px;
      border: 3px solid rgba(34,211,238,0.15);
      border-top-color: var(--sv-primary);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    .processing-steps {
      display: flex;
      flex-direction: column;
      gap: 12px;
      max-width: 320px;
      margin: 0 auto;
    }

    .processing-step {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 20px;
      background: var(--sv-surface);
      border: 1px solid var(--sv-border);
      border-radius: var(--radius-md);
      font-size: 14px;
      color: var(--sv-text-muted);
      transition: all 0.3s;
      text-align: left;
    }

    .processing-step.active { border-color: rgba(34,211,238,0.3); color: var(--sv-primary); }
    .processing-step.done { border-color: rgba(34,197,94,0.3); color: #22c55e; }
    .processing-step__icon { font-size: 16px; flex-shrink: 0; }

    .spinner-inline {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 2px solid rgba(5,10,20,0.3);
      border-top-color: #050a14;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    /* Summary Card */
    .payment-summary { position: sticky; top: 90px; }

    .payment-summary__card {
      background: var(--sv-surface);
      border: 1px solid var(--sv-border-2);
      border-radius: var(--radius-xl);
      padding: clamp(16px, 4vw, 28px);
      box-shadow: var(--sv-shadow);
      animation: fadeInUp 0.5s ease 0.1s both;
    }

    @media (max-width: 1024px) {
      .payment-summary { position: static; }
    }

    .payment-summary__card h3 {
      font-family: 'Space Grotesk', sans-serif;
      font-size: clamp(1rem, 2.5vw, 1.2rem);
      color: white;
      margin-bottom: clamp(12px, 2vw, 16px);
    }

    .payment-summary__room {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-bottom: 16px;
    }

    .payment-summary__room strong { font-size: 16px; color: white; }
    .payment-summary__room-label {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--sv-primary);
    }

    .payment-summary__room-loc { font-size: 13px; color: var(--sv-text-muted); }

    .payment-summary__dates {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px;
      background: var(--sv-surface-2);
      border-radius: var(--radius-md);
      margin-bottom: 16px;
    }

    .payment-summary__dates div {
      text-align: center;
    }

    .payment-summary__dates div span {
      display: block;
      font-size: 11px;
      color: var(--sv-text-muted);
      margin-bottom: 4px;
    }

    .payment-summary__dates div strong { font-size: 14px; color: white; }

    .payment-summary__nights span:first-child {
      display: block;
      font-size: 1.5rem;
      font-weight: 800;
      color: var(--sv-primary);
    }

    .payment-summary__amount { display: flex; flex-direction: column; gap: 8px; }

    .payment-summary__security {
      margin-top: 20px;
      padding-top: 16px;
      border-top: 1px solid var(--sv-border);
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .security-item { font-size: 13px; color: var(--sv-text-muted); }

    .amount-row {
      display: flex;
      justify-content: space-between;
      font-size: 14px;
      color: var(--sv-text-muted);
    }

    .amount-row--total { font-weight: 700; font-size: 16px; color: white; }

    .amount-total {
      font-size: 1.4rem;
      font-weight: 800;
      color: var(--sv-primary);
    }

    .divider {
      height: 1px;
      background: var(--sv-border);
      margin: 16px 0;
    }

    @keyframes spin { to { transform: rotate(360deg); } }

    @keyframes fadeInUp {
      from { opacity: 0; transform: translateY(16px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* ── Hold timer banner ─────────────────────────────── */
    .hold-timer {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 18px;
      border-radius: var(--radius-md);
      background: rgba(34,197,94,0.08);
      border: 1px solid rgba(34,197,94,0.25);
      color: #22c55e;
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 20px;
      animation: fadeInUp 0.4s ease;
    }

    .hold-timer--warning {
      background: rgba(245,158,11,0.08);
      border-color: rgba(245,158,11,0.3);
      color: #f59e0b;
    }

    /* ── Retry banner (card decline / timeout errors) ─── */
    .retry-banner {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 16px 18px;
      border-radius: var(--radius-lg);
      background: rgba(239,68,68,0.06);
      border: 1px solid rgba(239,68,68,0.25);
      color: #fca5a5;
      font-size: 14px;
      margin-bottom: 20px;
      animation: fadeInUp 0.3s ease;
    }

    .retry-banner > span { font-size: 18px; flex-shrink: 0; margin-top: 2px; }
    .retry-banner p { margin: 0 0 4px; line-height: 1.5; }
    .retry-limit { color: #f87171; font-size: 13px; margin-top: 6px !important; }

    /* ── State blocks (expired / conflict) ─────────────── */
    .state-block {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: clamp(24px, 6vw, 56px) var(--layout-padding-x);
      border-radius: var(--radius-xl);
      border: 1px solid var(--sv-border);
      background: var(--sv-surface);
      animation: fadeInUp 0.5s ease;
    }

    .state-block__icon { font-size: 3.5rem; margin-bottom: 20px; }

    .state-block h3 {
      font-family: 'Space Grotesk', sans-serif;
      font-size: 1.5rem;
      font-weight: 700;
      color: white;
      margin-bottom: 12px;
    }

    .state-block p { font-size: 15px; color: var(--sv-text-muted); line-height: 1.6; margin-bottom: 28px; }

    .state-block--expired { border-color: rgba(245,158,11,0.2); }
    .state-block--expired .state-block__icon { filter: drop-shadow(0 0 12px rgba(245,158,11,0.4)); }

    .state-block--conflict { border-color: rgba(239,68,68,0.2); }
    .state-block--conflict .state-block__icon { filter: drop-shadow(0 0 12px rgba(239,68,68,0.4)); }

    .btn--primary {
      display: inline-block;
      padding: 14px 28px;
      background: linear-gradient(135deg, #60a5fa, #22d3ee);
      color: #04111f;
      font-weight: 700;
      font-size: 15px;
      border-radius: var(--radius-md);
      border: 1px solid rgba(96,165,250,0.28);
      text-decoration: none;
      transition: transform 0.2s, box-shadow 0.2s;
      box-shadow:
        0 12px 28px rgba(14,165,233,0.22),
        inset 0 1px 0 rgba(255,255,255,0.16);
    }

    .btn--primary:hover {
      transform: translateY(-2px);
      box-shadow:
        0 16px 30px rgba(34,211,238,0.26),
        inset 0 1px 0 rgba(255,255,255,0.22);
    }

    /* Payment Methods */
    .payment-methods {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
      gap: 12px;
      margin-top: 8px;
    }

    .payment-method-btn {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 16px 12px;
      background: rgba(255, 255, 255, 0.04);
      border: 2px solid rgba(255, 255, 255, 0.12);
      border-radius: 10px;
      color: var(--sv-text-muted);
      font-weight: 600;
      font-size: 13px;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .payment-method-btn:hover {
      border-color: rgba(34, 211, 238, 0.3);
      background: rgba(34, 211, 238, 0.05);
      color: var(--sv-primary);
    }

    .payment-method-btn.active {
      border-color: var(--sv-primary);
      background: rgba(34, 211, 238, 0.12);
      color: var(--sv-primary);
      box-shadow: 0 0 0 3px rgba(34, 211, 238, 0.08);
    }

    .payment-method-icon {
      font-size: 24px;
      display: block;
    }

    .payment-method-label {
      display: block;
    }

    .payment-method-sub {
      display: block;
      font-size: 10px;
      font-weight: 400;
      color: rgba(255, 255, 255, 0.4);
      margin-top: -4px;
    }

    .form-label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      color: var(--sv-text-muted);
      margin-bottom: 12px;
    }
  `],
})
export class PaymentFormComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('cardMount') cardMountRef?: ElementRef<HTMLDivElement>;

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private http = inject(HttpClient);
  private paymentService = inject(PaymentService);
  private destroyRef = inject(DestroyRef);

  // Stripe internals
  private stripe: Stripe | null = null;
  private cardElement: StripeCardElement | null = null;

  // Component state
  step = signal<PaymentStep>('details');
  uiState = signal<PaymentUiState>('idle');
  // Expose feature toggle to the template.
  // Controlled via environment.stripeEnabled — no code change needed to flip it.
  readonly stripeEnabled = environment.stripeEnabled;

  paymentMethod = signal<'mock' | 'card'>('card');
  // When Stripe is disabled, default to UPI so users land on Razorpay immediately
  selectedPaymentMethod = signal<'card' | 'upi'>(
    environment.stripeEnabled ? 'card' : 'upi'
  );
  processing = signal(false);
  processingStepIdx = signal(-1);
  stripeReady = signal(false);
  cardElementReady = signal(false);

  // Retry state
  retryCount = signal(0);
  readonly maxRetries = 5;
  private readonly RETRY_COOLDOWN_SECONDS = 300; // 5 minutes
  retryCooldownSecondsLeft = signal(0);
  private retryCooldownInterval: ReturnType<typeof setInterval> | null = null;

  // Hold countdown
  holdSecondsLeft = signal(0);
  holdExpired = signal(false);
  holdExpiresAt = signal<string | null>(null);
  private holdCountdownInterval: ReturnType<typeof setInterval> | null = null;

  // Idempotency key (refreshed after each failed attempt)
  private idempotencyKey = signal(this.generateIdempotencyKey());

  booking = signal<PaymentBookingSummary | null>(null);
  bookingId = signal(0);
  bookingRef = signal('');
  bookingAmount = signal(0);
  bookingLoadError = signal('');
  cardError = signal('');
  actionMessage = signal('');
  cancellingBooking = signal(false);

  cardholderName = '';

  readonly bookingAppUrl = environment.bookingAppUrl;

  processingSteps = [
    { label: 'Validating card details' },
    { label: 'Contacting payment network' },
    { label: 'Authorizing transaction' },
    { label: 'Confirming booking' },
  ];

  // --- Lifecycle ---

  ngOnInit() {
    const id = this.route.snapshot.queryParamMap.get('booking_id');
    const ref = this.route.snapshot.queryParamMap.get('ref');
    if (id) this.bookingId.set(+id);
    if (ref) this.bookingRef.set(ref);
    if (id) this.loadBooking(+id);
  }

  ngAfterViewInit() {
    // Only initialize Stripe when the feature toggle is enabled.
    // Set stripeEnabled: false in environment.production.ts to keep Stripe
    // dormant without any code changes or re-deploys.
    if (environment.stripeEnabled) {
      this.initStripe();
    }
  }

  ngOnDestroy() {
    this.cardElementReady.set(false);
    this.cardElement?.destroy();
    this.stopHoldCountdown();
    this.stopRetryCooldown();
  }

  // --- Booking ---

  loadBooking(id: number) {
    this.bookingLoadError.set('');
    this.http.get<PaymentBookingSummary>(`${environment.apiUrl}/bookings/${id}`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
      next: b => {
        this.booking.set(b);
        this.bookingRef.set(b.booking_ref);
        this.bookingAmount.set(b.total_amount);
        this.bookingLoadError.set('');

        if (
          b.payment_status === 'paid'
          || b.status === 'confirmed'
          || b.lifecycle_state === 'CONFIRMED'
        ) {
          this.uiState.set('success');
          this.navigateToSuccess(`TXN-${b.booking_ref}`, b.total_amount, b.booking_ref);
          return;
        }

        // Start hold countdown and restore retry state on page refresh
        if (b.hold_expires_at) {
          this.holdExpiresAt.set(b.hold_expires_at);
          const holdExp = new Date(b.hold_expires_at).getTime();
          if (holdExp > Date.now()) {
            this.startHoldCountdown(b.hold_expires_at);
            if (b.payment_status === 'failed') {
              this.uiState.set('failed_retry');
              this.cardError.set('Your previous payment failed. Please try a different card.');
              this.refreshRetryPolicy(id);
            }
          } else {
            this.uiState.set('expired');
          }
        }
      },
      error: () => {
        this.bookingLoadError.set(
          'Unable to load booking details. Check your connection or CORS settings.'
        );
        this.bookingAmount.set(0);
      },
    });
  }

  retryLoadBooking() {
    if (this.bookingId()) this.loadBooking(this.bookingId());
  }

  // --- Hold Countdown ---

  private generateIdempotencyKey(): string {
    const arr = new Uint8Array(8);
    crypto.getRandomValues(arr);
    const hex = Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
    return `pay_${Date.now()}_${hex}`;
  }

  private startHoldCountdown(holdExpiresAt: string): void {
    this.stopHoldCountdown();
    const expiry = new Date(holdExpiresAt).getTime();
    const tick = () => {
      const secs = Math.max(0, Math.round((expiry - Date.now()) / 1000));
      this.holdSecondsLeft.set(secs);
      if (secs === 0) {
        this.stopHoldCountdown();
        this.holdExpired.set(true);
        if (this.uiState() !== 'processing' && this.uiState() !== 'success') {
          this.uiState.set('expired');
        }
      }
    };
    tick();
    this.holdCountdownInterval = setInterval(tick, 1000);
  }

  holdMinutes = () => String(Math.floor(this.holdSecondsLeft() / 60)).padStart(2, '0');
  holdSecondsPad = () => String(this.holdSecondsLeft() % 60).padStart(2, '0');

  private stopHoldCountdown(): void {
    if (this.holdCountdownInterval) {
      clearInterval(this.holdCountdownInterval);
      this.holdCountdownInterval = null;
    }
  }

  retryCooldownMinutes = () => String(Math.floor(this.retryCooldownSecondsLeft() / 60)).padStart(2, '0');
  retryCooldownSecondsPad = () => String(this.retryCooldownSecondsLeft() % 60).padStart(2, '0');

  private startRetryCooldown(seconds: number): void {
    this.stopRetryCooldown();
    const endTime = Date.now() + Math.max(0, seconds) * 1000;
    const tick = () => {
      const secs = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
      this.retryCooldownSecondsLeft.set(secs);
      if (secs === 0) {
        this.stopRetryCooldown();
        this.retryCount.set(0);
        if (this.uiState() === 'failed_retry') {
          this.cardError.set('Retry is available now. You can try another card while the room hold is active.');
        }
      }
    };
    tick();
    this.retryCooldownInterval = setInterval(tick, 1000);
  }

  private stopRetryCooldown(): void {
    if (this.retryCooldownInterval) {
      clearInterval(this.retryCooldownInterval);
      this.retryCooldownInterval = null;
    }
  }

  private applyRetryCooldown(detail?: PaymentCooldownDetail): void {
    const retryAfterSeconds = detail?.retry_after_seconds ?? 0;
    if (detail?.failed_payment_count) {
      this.retryCount.set(detail.failed_payment_count);
    }
    if (retryAfterSeconds > 0) {
      this.startRetryCooldown(retryAfterSeconds);
      this.uiState.set('failed_retry');
      this.cardError.set(
        `${detail?.message || 'Payment temporarily paused for security.'} Retry available in ${this.retryCooldownMinutes()}:${this.retryCooldownSecondsPad()}. Try another card when retry opens, or cancel this booking.`
      );
    }
  }

  private refreshRetryPolicy(bookingId: number): void {
    this.paymentService.getPaymentStatus(bookingId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
      next: status => {
        this.applyRetryCooldown({
          failed_payment_count: status.failed_payment_count,
          retry_after_seconds: status.retry_after_seconds,
          retry_available_at: status.retry_available_at,
        });
      },
      error: () => {
        // Retry policy is advisory only; the payment attempt will still be guarded by the backend.
      },
    });
  }

  goBackToBooking(): void {
    const bookingId = this.bookingId();
    if (bookingId > 0) {
      this.externalRedirect(`${this.bookingAppUrl.replace(/\/$/, '')}/checkout/${bookingId}`);
      return;
    }
    this.externalRedirect(this.bookingAppUrl);
  }

  cancelBooking(): void {
    const bookingId = this.bookingId();
    if (!bookingId || this.cancellingBooking() || this.processing()) return;
    this.actionMessage.set('');
    this.cancellingBooking.set(true);
    this.http.patch<PaymentBookingSummary>(`${environment.apiUrl}/bookings/${bookingId}/cancel`, {})
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
      next: () => {
        this.cancellingBooking.set(false);
        this.stopHoldCountdown();
        this.stopRetryCooldown();
        this.holdSecondsLeft.set(0);
        this.retryCooldownSecondsLeft.set(0);
        this.uiState.set('expired');
        this.actionMessage.set('Booking cancelled successfully. Your room hold has been released.');
        setTimeout(() => {
          this.externalRedirect(this.bookingAppUrl);
        }, 900);
      },
      error: () => {
        this.cancellingBooking.set(false);
        this.cardError.set('Could not cancel this booking right now. Please try again.');
      },
    });
  }

  private readonly ALLOWED_REDIRECT_HOSTS = [
    'stayvora.co.in',
    'pay.stayvora.co.in',
    'payflow-payment-app.vercel.app',
    'localhost',    // dev: StayEase / PayFlow local servers
    '127.0.0.1',
  ];

  private externalRedirect(url: string): void {
    try {
      const parsed = new URL(url);
      if (!this.ALLOWED_REDIRECT_HOSTS.some(h => parsed.hostname === h || parsed.hostname.endsWith('.' + h))) {
        console.error('Redirect blocked: untrusted host', parsed.hostname);
        return;
      }
      window.location.href = url;
    } catch {
      console.error('Invalid redirect URL');
    }
  }

  private mountCardElement(): void {
    const mountEl = this.cardMountRef?.nativeElement;
    if (!this.stripe || !mountEl || !mountEl.isConnected) return;

    this.cardElementReady.set(false);
    this.cardElement?.destroy();
    this.cardElement = null;

    const elements = this.stripe.elements({
      appearance: {
        theme: 'night',
        variables: {
          colorPrimary: '#d6b86b',
          colorBackground: '#111827',
          colorText: '#f1f5f9',
          colorTextSecondary: '#94a3b8',
          colorDanger: '#ef4444',
          fontFamily: 'Space Grotesk, system-ui, sans-serif',
          borderRadius: '8px',
          spacingUnit: '4px',
        },
        rules: {
          '.Input': {
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: 'none',
            backgroundColor: 'rgba(255,255,255,0.04)',
            padding: '12px',
          },
          '.Input:focus': {
            border: '1px solid rgba(34,211,238,0.4)',
            boxShadow: '0 0 0 3px rgba(34,211,238,0.08)',
          },
          '.Label': {
            color: '#94a3b8',
            fontSize: '13px',
            marginBottom: '6px',
          },
        },
      },
    });

    this.cardElement = elements.create('card', {
      hidePostalCode: true,
      style: {
        base: {
          color: '#f1f5f9',
          fontFamily: 'Space Grotesk, system-ui, sans-serif',
          fontSize: '16px',
          '::placeholder': { color: '#475569' },
          iconColor: '#d6b86b',
        },
        invalid: {
          color: '#ef4444',
          iconColor: '#ef4444',
        },
      },
    });

    this.cardElement.mount(mountEl);

    this.cardElement.on('ready', () => {
      this.cardElementReady.set(true);
    });

    this.cardElement.on('change', event => {
      this.cardError.set(event.error?.message ?? '');
    });

    this.stripeReady.set(true);
  }

  private queueCardMount(): void {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.mountCardElement();
      });
    });
  }

  private restoreCardEntry(): void {
    this.step.set('details');
    this.cardElementReady.set(false);
    this.cardElement?.destroy();
    this.cardElement = null;
    this.queueCardMount();
  }

  private navigateToSuccess(transactionRef: string, amount: number, bookingRef?: string) {
    this.router.navigate(['/success'], {
      queryParams: {
        ref: transactionRef,
        amount,
        booking_id: this.bookingId(),
        booking_ref: bookingRef || this.bookingRef() || this.booking()?.booking_ref,
      },
    });
  }

  private async verifyConfirmedPayment(): Promise<boolean> {
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        const status = await firstValueFrom(this.paymentService.getPaymentStatus(this.bookingId()));
        if (
          status.payment_status === 'paid'
          || status.booking_status === 'confirmed'
          || status.lifecycle_state === 'CONFIRMED'
        ) {
          this.navigateToSuccess(
            status.latest_transaction?.transaction_ref || `TXN-${Date.now()}`,
            status.latest_transaction?.amount || this.bookingAmount(),
            status.booking_ref
          );
          return true;
        }
      } catch {
        // Keep polling briefly to allow webhook or backend confirmation to finish.
      }

      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    return false;
  }

  // --- Stripe Setup ---

  private async initStripe() {
    try {
      this.stripeReady.set(false);
      this.cardElementReady.set(false);
      this.stripe = await loadStripe(environment.stripePublishableKey);
      if (!this.stripe) return;
      this.stripeReady.set(true);
      this.queueCardMount();
    } catch {
      this.stripeReady.set(false);
    }
  }

  // --- Payment Method Selection ---

  selectPaymentMethod(method: 'card' | 'upi'): void {
    this.selectedPaymentMethod.set(method);
    this.cardError.set('');
    if (method === 'card' && environment.stripeEnabled) {
      this.initStripe();
    }
  }

  getPaymentMethodLabel(method: string): string {
    const labels: Record<string, string> = {
      'card': 'Card',
      'upi': 'UPI',
      'gpay': 'Google Pay',
      'phonepe': 'PhonePe'
    };
    return labels[method] || method;
  }

  /**
   * Convert USD to INR using the exchange rate from the backend.
   * Falls back to a cached rate if the API is unavailable.
   */
  private cachedExchangeRate = 83; // fallback only — updated from API

  convertUSDToINR(usd: number): number {
    return Math.round(usd * this.cachedExchangeRate);
  }

  /** Fetch live exchange rate from backend on component init. */
  private refreshExchangeRate(): void {
    this.http.get<{ rate: number }>(`${environment.apiUrl}/exchange-rate/usd-inr`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => { if (res?.rate) this.cachedExchangeRate = res.rate; },
        error: () => { /* use fallback rate */ }
      });
  }

  // --- Razorpay Payment ---

  private loadRazorpayScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      if ((window as unknown as { Razorpay?: unknown }).Razorpay) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.crossOrigin = 'anonymous';
      // Note: SRI hash should be updated whenever Razorpay version changes.
      // Generate hash with: curl -s https://checkout.razorpay.com/v1/checkout.js | openssl dgst -sha384 -binary | base64
      // For now, SRI verification is optional. Uncomment and add actual hash when available:
      // script.integrity = 'sha384-<actual-hash-from-razorpay>';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Razorpay'));
      document.body.appendChild(script);
    });
  }

  async payWithRazorpay(method: 'upi' | 'card'): Promise<void> {
    try {
      // Double-click guard
      if (this.processing()) return;

      // Pre-flight checks
      if (!this.bookingAmount()) {
        this.cardError.set('Booking details loading…');
        return;
      }
      if (this.holdSecondsLeft() <= 0) {
        this.cardError.set('Your booking hold has expired. Please create a new booking.');
        return;
      }
      if (this.retryCooldownSecondsLeft() > 0) {
        this.cardError.set(`Retry available in ${this.retryCooldownMinutes()}:${this.retryCooldownSecondsPad()}.`);
        return;
      }

      this.processing.set(true);
      this.cardError.set('');
      this.step.set('processing');
      this.processingStepIdx.set(0);

      // Step 0 — Load Razorpay SDK
      await this.loadRazorpayScript();

      // Step 1 — Create order on backend
      this.processingStepIdx.set(1);
      const order = await firstValueFrom(
        this.paymentService.createRazorpayOrder(
          this.bookingId(),
          method,
          this.idempotencyKey()
        )
      );

      // Step 2 — Open Razorpay checkout modal
      this.processingStepIdx.set(2);

      // Return to form view so the Razorpay modal overlays the payment page
      this.step.set('details');

      const options = {
        key: order.key_id,
        amount: order.amount_paise,
        currency: order.currency || 'INR',
        order_id: order.order_id,
        name: 'Stayvora',
        description: 'Hotel Booking Payment',
        prefill: {
          method: 'upi'
        },
        theme: {
          color: '#d6b86b'
        },
        handler: async (response: RazorpayResponse) => {
          try {
            this.step.set('processing');
            this.processingStepIdx.set(3);

            await firstValueFrom(
              this.paymentService.verifyRazorpayPayment({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                transaction_ref: order.transaction_ref ?? '',
              })
            );

            if (await this.verifyConfirmedPayment()) {
              this.processing.set(false);
            } else {
              this.cardError.set('Payment is being confirmed. Please check your booking status shortly.');
              this.processing.set(false);
              this.step.set('details');
            }
          } catch {
            this.cardError.set('Payment verification failed. Please try again.');
            this.processing.set(false);
            this.step.set('details');
          }
        },
        modal: {
          ondismiss: () => {
            this.cardError.set('Payment was not completed. You can try again.');
            this.processing.set(false);
            this.step.set('details');
          }
        }
      };

      const rzp = new Razorpay(options as RazorpayOptions);

      // Handle explicit payment failures from Razorpay (card declined, UPI timeout, etc.)
      rzp.on('payment.failed', (failedResponse: RazorpayFailedResponse) => {
        const reason = failedResponse.error?.description || 'Payment failed';

        // Record failure to backend for tracking
        this.paymentService.recordFailure(
          this.bookingId(),
          reason,
          undefined,
          order.transaction_ref,
        )
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe();

        this.retryCount.update(c => c + 1);
        if (this.retryCount() >= this.maxRetries) {
          this.startRetryCooldown(this.RETRY_COOLDOWN_SECONDS);
          this.cardError.set(`Too many failed attempts. Retry available in ${this.retryCooldownMinutes()}:${this.retryCooldownSecondsPad()}.`);
        } else {
          this.cardError.set(`${reason}. Please try again.`);
        }
        this.processing.set(false);
        this.step.set('details');
      });

      rzp.open();
    } catch (err: unknown) {
      const httpErr = err as { status?: number; error?: { detail?: string | { message?: string } } };
      const detail = httpErr?.error?.detail;
      let message = 'Payment failed. Please try again.';

      if (httpErr?.status === 409) {
        const detailMsg = typeof detail === 'string' ? detail : (detail as { message?: string })?.message || '';
        if (detailMsg.toLowerCase().includes('already paid')) {
          if (await this.verifyConfirmedPayment()) return;
          message = 'Payment may already be completed. Please check your booking status.';
        } else {
          message = detailMsg || 'Booking is no longer available for payment.';
        }
      } else if (httpErr?.status === 400) {
        message = typeof detail === 'string' ? detail : 'This booking cannot be paid for.';
      } else if (httpErr?.status === 502) {
        message = 'Payment gateway is temporarily unavailable. Please try again.';
      } else if (httpErr?.status === 503) {
        message = 'Razorpay is not available. Please try again later.';
      }

      this.cardError.set(message);
      this.processing.set(false);
      this.step.set('details');
    }
  }

  // --- Tab Switch ---

  // --- Mock Payment ---

  processMockPayment(success: boolean) {
    if (!this.bookingId() || !this.bookingAmount()) return;

    this.step.set('processing');
    this.runProcessingAnimation().then(() => {
      if (success) {
        const txnRef = 'TXN-' + Math.random().toString(36).substring(2, 14).toUpperCase();
        this.paymentService.confirmPayment({
          booking_id: this.bookingId(),
          transaction_ref: txnRef,
          payment_method: 'mock',
        })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (transaction) => {
            this.navigateToSuccess(
              transaction.transaction_ref,
              transaction.amount,
              transaction.booking?.booking_ref
            );
          },
          error: async () => {
            if (!(await this.verifyConfirmedPayment())) {
              this.step.set('details');
              this.processing.set(false);
              this.cardError.set('Payment confirmation is still processing. Please try again in a moment.');
            }
          },
        });
      } else {
        const failReason = 'Card declined (demo)';
        this.paymentService.recordFailure(this.bookingId(), failReason)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe();
        this.router.navigate(['/failure'], {
          queryParams: {
            booking_id: this.bookingId(),
            reason: failReason,
            hold_expires_at: this.holdExpiresAt(),
          },
        });
      }
    });
  }

  // --- Real Stripe Card Payment ---

  async processCardPayment() {
    // Double-click guard — also prevents re-entry while already processing
    if (this.processing()) return;

    // Pre-flight validation (no network calls yet — fail fast in UI)
    if (!this.bookingAmount()) {
      this.cardError.set('Booking details loading…');
      return;
    }
    if (!this.cardholderName.trim()) {
      this.cardError.set('Please enter the cardholder name.');
      return;
    }
    if (!this.stripe || !this.cardElement) {
      this.cardError.set('Payment system not ready. Please refresh.');
      return;
    }
    if (!this.cardElementReady()) {
      this.cardError.set('Card form still initializing. Please wait.');
      return;
    }
    if (this.retryCooldownSecondsLeft() > 0) {
      this.cardError.set(`Retry available in ${this.retryCooldownMinutes()}:${this.retryCooldownSecondsPad()}. Your room hold is still active.`);
      return;
    }
    if (this.retryCount() >= this.maxRetries) {
      this.startRetryCooldown(this.RETRY_COOLDOWN_SECONDS);
      this.uiState.set('failed_retry');
      this.cardError.set(`Payment temporarily paused for security. Retry available in ${this.retryCooldownMinutes()}:${this.retryCooldownSecondsPad()}.`);
      return;
    }

    this.processing.set(true);
    this.uiState.set('processing');
    this.cardError.set('');

    try {
      // Step 1 — create payment intent (idempotency key prevents duplicate charges on double-network-retry)
      // NOTE: do NOT set step='processing' yet — that would destroy #cardMount via @if,
      // unmounting the Stripe Element before confirmCardPayment can use it.
      const intent = await firstValueFrom(
        this.paymentService.createPaymentIntent(this.bookingId(), 'card', this.idempotencyKey())
          .pipe(timeout(15_000))
      );

      // Step 2 — confirm with Stripe.js BEFORE switching view (card element must stay mounted)
      const { error, paymentIntent } = await this.stripe!.confirmCardPayment(
        intent.client_secret,
        { payment_method: { card: this.cardElement!, billing_details: { name: this.cardholderName } } }
      );

      // Now safe to switch to animation view
      this.step.set('processing');
      await this.runProcessingAnimation();

      if (error) {
        // Record decline in backend — inventory stays locked if hold still valid (backend fix)
        let backendRetryPolicy: PaymentCooldownDetail | undefined;
        try {
          backendRetryPolicy = await firstValueFrom(
            this.paymentService.recordFailure(
              this.bookingId(),
              error.message || 'Card declined',
              intent.payment_intent_id,
              intent.transaction_ref,
            )
              .pipe(timeout(10_000))
          );
        } catch {
          // Non-fatal — failure record best-effort
        }

        this.retryCount.update(n => n + 1);
        if (backendRetryPolicy?.retry_after_seconds) {
          this.applyRetryCooldown(backendRetryPolicy);
        } else if (this.retryCount() >= this.maxRetries) {
          this.startRetryCooldown(this.RETRY_COOLDOWN_SECONDS);
        }
        this.idempotencyKey.set(this.generateIdempotencyKey()); // fresh key for next attempt
        this.uiState.set('failed_retry');
        this.restoreCardEntry();
        const holdInfo = this.holdSecondsLeft() > 0
          ? ` Your room is reserved for ${this.holdMinutes()}:${this.holdSecondsPad()}.`
          : '';
        if (this.retryCooldownSecondsLeft() === 0) {
          this.cardError.set(
            `${error.message || 'Payment failed.'}${holdInfo} Please try a different card.`
          );
        }
        this.cardholderName = '';
        return;
      }

      if (paymentIntent?.status === 'succeeded') {
        const txnRef = 'TXN-' + paymentIntent.id.slice(-12).toUpperCase();
        const transaction = await firstValueFrom(
          this.paymentService.confirmPayment({
            booking_id: this.bookingId(),
            transaction_ref: txnRef,
            payment_intent_id: paymentIntent.id,
            payment_method: 'card',
          }).pipe(timeout(15_000))
        );
        if (transaction.status === 'success') {
          this.uiState.set('success');
          this.navigateToSuccess(
            transaction.transaction_ref,
            transaction.amount,
            transaction.booking?.booking_ref,
          );
          return;
        }

        if (await this.verifyConfirmedPayment()) {
          this.uiState.set('success');
          return;
        }

        this.uiState.set('failed_retry');
        this.restoreCardEntry();
        this.cardError.set(
          'Payment confirmation is still syncing. Please wait a moment and check your booking again.',
        );
      }

    } catch (err: unknown) {
      const paymentError = err as PaymentErrorShape;
      const status = paymentError.status;
      const detail = paymentError.error?.detail || '';
      const detailMessage = typeof detail === 'string' ? detail : detail.message || '';

      if (
        status === 409 &&
        (
          detailMessage.toLowerCase().includes('unavailable') ||
          detailMessage.toLowerCase().includes('available') ||
          detailMessage.toLowerCase().includes('reserved') ||
          detailMessage.toLowerCase().includes('expired')
        )
      ) {
        this.uiState.set('conflict');
        this.cardError.set(detailMessage);
      } else if (status === 409 && detailMessage.toLowerCase().includes('already paid')) {
        if (!(await this.verifyConfirmedPayment())) {
          this.uiState.set('failed_retry');
          this.restoreCardEntry();
          this.cardError.set('Payment is still syncing. Please wait a moment and retry.');
        } else {
          this.uiState.set('success');
        }
      } else if (status === 503 && typeof detail !== 'string' && detail?.code === 'STRIPE_DISABLED') {
        // Stripe is toggled off — direct user to Razorpay
        this.uiState.set('idle');
        this.selectPaymentMethod('upi');
        this.cardError.set('Card payments are temporarily unavailable. Please pay via UPI, GPay, or PhonePe.');
      } else if (paymentError.name === 'TimeoutError') {
        this.uiState.set('failed_retry');
        this.restoreCardEntry();
        this.cardError.set('Payment timed out. Please try again.');
      } else if (status === 429 && typeof detail !== 'string') {
        this.restoreCardEntry();
        this.applyRetryCooldown(detail);
      } else {
        this.uiState.set('failed_retry');
        this.restoreCardEntry();
        this.cardError.set(detailMessage || 'Payment failed. Please try again.');
      }
    } finally {
      this.processing.set(false); // ← ALWAYS resets — prevents UI freeze on any exception
    }
  }

  // --- Animation ---

  private runProcessingAnimation(): Promise<void> {
    this.processingStepIdx.set(-1);
    return new Promise(resolve => {
      let i = 0;
      const iv = setInterval(() => {
        this.processingStepIdx.set(i++);
        if (i >= this.processingSteps.length) {
          clearInterval(iv);
          setTimeout(resolve, 500);
        }
      }, 650);
    });
  }
}
