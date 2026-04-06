import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { loadStripe, Stripe, StripeCardElement } from '@stripe/stripe-js';
import { firstValueFrom } from 'rxjs';
import { timeout } from 'rxjs/operators';
import { PaymentService } from '../../core/services/payment.service';
import { environment } from '../../../environments/environment';

type PaymentStep = 'details' | 'processing';
type PaymentUiState = 'idle' | 'processing' | 'failed_retry' | 'success' | 'expired' | 'conflict';

interface PaymentRoomSummary {
  hotel_name?: string;
  image_url?: string;
  location?: string;
}

interface PaymentBookingSummary {
  booking_ref: string;
  total_amount: number;
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
    detail?: string;
  };
}

@Component({
  selector: 'app-payment-form',
  standalone: true,
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
                  @if (retryCount() >= maxRetries) {
                    <p class="retry-limit">Maximum retry attempts reached. Please contact support or try a different payment method.</p>
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
                [disabled]="processing() || !stripeReady() || !cardElementReady() || !bookingAmount()"
              >
                @if (processing()) {
                  <span class="spinner-inline"></span> Processing…
                } @else if (!stripeReady()) {
                  Loading payment system…
                } @else if (!cardElementReady()) {
                  Preparing secure card form…
                } @else if (!bookingAmount()) {
                  Loading booking…
                } @else {
                  Pay \${{ bookingAmount() | number:'1.0-0' }} Securely 🔒
                }
              </button>
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
            <div class="processing-state">
              <div class="processing-state__spinner">
                <div class="spinner-ring"></div>
                <span>💳</span>
              </div>
              <h2>Processing Payment…</h2>
              <p>Please wait while we securely process your payment.</p>
              <div class="processing-steps">
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
                <span>\${{ (bookingAmount() / 1.17) | number:'1.0-0' }}</span>
              </div>
              <div class="amount-row">
                <span>Taxes & Fees</span>
                <span>\${{ (bookingAmount() - bookingAmount() / 1.17) | number:'1.0-0' }}</span>
              </div>
              <div class="divider"></div>
              <div class="amount-row amount-row--total">
                <span>Total Due</span>
                <span class="amount-total">\${{ bookingAmount() | number:'1.0-0' }}</span>
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
      background: var(--pf-gradient);
      z-index: -1;
      overflow: hidden;
    }

    .payment-page__inner {
      width: 100%;
      max-width: 1100px;
      margin: 0 auto;
      padding: 48px 32px;
      display: grid;
      grid-template-columns: 1fr 380px;
      gap: 40px;
      align-items: start;
    }

    @media (max-width: 1024px) {
      .payment-page__inner { grid-template-columns: 1fr; }
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
    .pf-header { margin-bottom: 32px; animation: fadeInUp 0.5s ease; }

    .pf-header__badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(34,211,238,0.1);
      border: 1px solid rgba(34,211,238,0.2);
      color: var(--pf-primary);
      padding: 6px 14px;
      border-radius: 99px;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 1px;
      margin-bottom: 16px;
    }

    .pf-header__title {
      font-family: 'Space Grotesk', sans-serif;
      font-size: clamp(2rem, 4vw, 3rem);
      font-weight: 700;
      color: white;
      margin-bottom: 8px;
    }

    .pf-header__title span { color: var(--pf-primary); }
    .pf-header__sub { font-size: 14px; color: var(--pf-text-muted); }

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
      background: rgba(245,158,11,0.08);
      border: 1px solid rgba(245,158,11,0.2);
      border-radius: var(--radius-md);
      padding: 14px;
      margin-top: 16px;
      font-size: 12px;
      color: #f59e0b;
      line-height: 1.7;
    }

    .pay-btn {
      width: 100%;
      margin-top: 20px;
      padding: 18px;
      font-size: 16px;
      font-weight: 700;
    }

    .pay-btn:disabled { opacity: 0.5; cursor: not-allowed; }

    /* Trust */
    .pf-trust {
      display: flex;
      gap: 20px;
      justify-content: center;
      flex-wrap: wrap;
      margin-top: 24px;
      padding-top: 20px;
      border-top: 1px solid var(--pf-border);
    }

    .pf-trust span { font-size: 12px; color: var(--pf-text-muted); font-weight: 500; }

    /* Processing */
    .processing-state {
      text-align: center;
      padding: 60px 20px;
      animation: fadeInUp 0.5s ease;
    }

    .processing-state h2 {
      font-family: 'Space Grotesk', sans-serif;
      font-size: 1.8rem;
      color: white;
      margin-bottom: 8px;
    }

    .processing-state p { font-size: 15px; color: var(--pf-text-muted); margin-bottom: 32px; }

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
      border-top-color: var(--pf-primary);
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
      background: var(--pf-surface);
      border: 1px solid var(--pf-border);
      border-radius: var(--radius-md);
      font-size: 14px;
      color: var(--pf-text-muted);
      transition: all 0.3s;
      text-align: left;
    }

    .processing-step.active { border-color: rgba(34,211,238,0.3); color: var(--pf-primary); }
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
      background: var(--pf-surface);
      border: 1px solid var(--pf-border-2);
      border-radius: var(--radius-xl);
      padding: 28px;
      box-shadow: var(--pf-shadow);
      animation: fadeInUp 0.5s ease 0.1s both;
    }

    .payment-summary__card h3 {
      font-family: 'Space Grotesk', sans-serif;
      font-size: 1.2rem;
      color: white;
      margin-bottom: 16px;
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
      color: var(--pf-primary);
    }

    .payment-summary__room-loc { font-size: 13px; color: var(--pf-text-muted); }

    .payment-summary__dates {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px;
      background: var(--pf-surface-2);
      border-radius: var(--radius-md);
      margin-bottom: 16px;
    }

    .payment-summary__dates div {
      text-align: center;
    }

    .payment-summary__dates div span {
      display: block;
      font-size: 11px;
      color: var(--pf-text-muted);
      margin-bottom: 4px;
    }

    .payment-summary__dates div strong { font-size: 14px; color: white; }

    .payment-summary__nights span:first-child {
      display: block;
      font-size: 1.5rem;
      font-weight: 800;
      color: var(--pf-primary);
    }

    .payment-summary__amount { display: flex; flex-direction: column; gap: 8px; }

    .payment-summary__security {
      margin-top: 20px;
      padding-top: 16px;
      border-top: 1px solid var(--pf-border);
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .security-item { font-size: 13px; color: var(--pf-text-muted); }

    .amount-row {
      display: flex;
      justify-content: space-between;
      font-size: 14px;
      color: var(--pf-text-muted);
    }

    .amount-row--total { font-weight: 700; font-size: 16px; color: white; }

    .amount-total {
      font-size: 1.4rem;
      font-weight: 800;
      color: var(--pf-primary);
    }

    .divider {
      height: 1px;
      background: var(--pf-border);
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
      padding: 56px 32px;
      border-radius: var(--radius-xl);
      border: 1px solid var(--pf-border);
      background: var(--pf-surface);
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

    .state-block p { font-size: 15px; color: var(--pf-text-muted); line-height: 1.6; margin-bottom: 28px; }

    .state-block--expired { border-color: rgba(245,158,11,0.2); }
    .state-block--expired .state-block__icon { filter: drop-shadow(0 0 12px rgba(245,158,11,0.4)); }

    .state-block--conflict { border-color: rgba(239,68,68,0.2); }
    .state-block--conflict .state-block__icon { filter: drop-shadow(0 0 12px rgba(239,68,68,0.4)); }

    .btn--primary {
      display: inline-block;
      padding: 14px 28px;
      background: linear-gradient(135deg, var(--pf-primary), #0ea5e9);
      color: #050a14;
      font-weight: 700;
      font-size: 15px;
      border-radius: var(--radius-md);
      text-decoration: none;
      transition: transform 0.2s, box-shadow 0.2s;
    }

    .btn--primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(34,211,238,0.3);
    }
  `],
})
export class PaymentFormComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('cardMount') cardMountRef?: ElementRef<HTMLDivElement>;

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private http = inject(HttpClient);
  private paymentService = inject(PaymentService);

  // Stripe internals
  private stripe: Stripe | null = null;
  private cardElement: StripeCardElement | null = null;

  // Component state
  step = signal<PaymentStep>('details');
  uiState = signal<PaymentUiState>('idle');
  paymentMethod = signal<'mock' | 'card'>('card');
  processing = signal(false);
  processingStepIdx = signal(-1);
  stripeReady = signal(false);
  cardElementReady = signal(false);

  // Retry state
  retryCount = signal(0);
  readonly maxRetries = 3;

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

  cardholderName = '';

  readonly bookingAppUrl = environment.bookingAppUrl;

  processingSteps = [
    { label: 'Validating card details' },
    { label: 'Contacting payment network' },
    { label: 'Authorizing transaction' },
    { label: 'Confirming booking' },
  ];

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  ngOnInit() {
    const id = this.route.snapshot.queryParamMap.get('booking_id');
    const ref = this.route.snapshot.queryParamMap.get('ref');
    if (id) this.bookingId.set(+id);
    if (ref) this.bookingRef.set(ref);
    if (id) this.loadBooking(+id);
  }

  ngAfterViewInit() {
    // Initialize Stripe Elements after view is ready
    this.initStripe();
  }

  ngOnDestroy() {
    this.cardElementReady.set(false);
    this.cardElement?.destroy();
    this.stopHoldCountdown();
  }

  // ─── Booking ────────────────────────────────────────────────────────────────

  loadBooking(id: number) {
    this.bookingLoadError.set('');
    this.http.get<PaymentBookingSummary>(`${environment.apiUrl}/bookings/${id}`).subscribe({
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

  // ─── Hold Countdown ──────────────────────────────────────────────────────────

  private generateIdempotencyKey(): string {
    return `pay_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
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
          colorPrimary: '#22d3ee',
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
          iconColor: '#22d3ee',
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

  // ─── Stripe Setup ────────────────────────────────────────────────────────────

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

  // ─── Tab Switch ──────────────────────────────────────────────────────────────

  // ─── Mock Payment ────────────────────────────────────────────────────────────

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
        }).subscribe({
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
        this.paymentService.recordFailure(this.bookingId(), failReason).subscribe();
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

  // ─── Real Stripe Card Payment ────────────────────────────────────────────────

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
    if (this.retryCount() >= this.maxRetries) {
      this.cardError.set('Maximum retry attempts reached. Please contact support.');
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
        try {
          await firstValueFrom(
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
        this.idempotencyKey.set(this.generateIdempotencyKey()); // fresh key for next attempt
        this.uiState.set('failed_retry');
        this.restoreCardEntry();
        const holdInfo = this.holdSecondsLeft() > 0
          ? ` Your room is reserved for ${this.holdMinutes()}:${this.holdSecondsPad()}.`
          : '';
        this.cardError.set(
          `${error.message || 'Payment failed.'}${holdInfo} Please try a different card.`
        );
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

      if (
        status === 409 &&
        (
          detail.toLowerCase().includes('unavailable') ||
          detail.toLowerCase().includes('available') ||
          detail.toLowerCase().includes('reserved') ||
          detail.toLowerCase().includes('expired')
        )
      ) {
        this.uiState.set('conflict');
        this.cardError.set(detail || 'These dates are no longer available. Please go back and select new dates.');
      } else if (status === 409 && detail.toLowerCase().includes('already paid')) {
        if (!(await this.verifyConfirmedPayment())) {
          this.uiState.set('failed_retry');
          this.restoreCardEntry();
          this.cardError.set('Payment is still syncing. Please wait a moment and retry.');
        } else {
          this.uiState.set('success');
        }
      } else if (paymentError.name === 'TimeoutError') {
        this.uiState.set('failed_retry');
        this.restoreCardEntry();
        this.cardError.set('Payment timed out. Please try again.');
      } else {
        this.uiState.set('failed_retry');
        this.restoreCardEntry();
        this.cardError.set(detail || 'Payment failed. Please try again.');
      }
    } finally {
      this.processing.set(false); // ← ALWAYS resets — prevents UI freeze on any exception
    }
  }

  // ─── Animation ───────────────────────────────────────────────────────────────

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
