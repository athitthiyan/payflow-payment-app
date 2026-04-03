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
import { loadStripe, Stripe, StripeCardElement, StripeElements } from '@stripe/stripe-js';
import { PaymentService } from '../../core/services/payment.service';
import { environment } from '../../../environments/environment';

type PaymentStep = 'details' | 'processing';

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

          @if (step() === 'details') {

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

            <!-- Method Tabs -->
            <div class="pf-method-tabs">
              <button class="pf-method-tab" [class.active]="paymentMethod() === 'mock'" (click)="switchTab('mock')">
                Demo Mode
              </button>
              <button class="pf-method-tab" [class.active]="paymentMethod() === 'card'" (click)="switchTab('card')">
                💳 Credit Card (Stripe)
              </button>
            </div>

            <!-- ─── Mock / Demo Mode ─────────────────────────────────── -->
            @if (paymentMethod() === 'mock') {
              <div class="demo-payment">
                <div class="demo-payment__info">
                  <h3>Demo Payment Mode</h3>
                  <p>Simulates a real payment without charging any card. Perfect for portfolio demonstrations.</p>
                </div>
                <div class="demo-payment__options">
                  <button
                    class="demo-btn demo-btn--success"
                    [disabled]="!bookingAmount() || processing()"
                    (click)="processMockPayment(true)"
                  >
                    ✅ Simulate Successful Payment
                    <span>→ \${{ bookingAmount() | number:'1.0-0' }} charged</span>
                  </button>
                  <button
                    class="demo-btn demo-btn--failure"
                    [disabled]="!bookingAmount() || processing()"
                    (click)="processMockPayment(false)"
                  >
                    ❌ Simulate Failed Payment
                    <span>→ Card declined</span>
                  </button>
                </div>
                @if (!bookingAmount() && !bookingLoadError()) {
                  <p class="loading-hint">⏳ Loading booking details…</p>
                }
              </div>
            }

            <!-- ─── Real Stripe Card Form ────────────────────────────── -->
            <!-- Always rendered (not inside @if) so Stripe can mount to #cardMount -->
            <div [style.display]="paymentMethod() === 'card' ? 'block' : 'none'" class="card-form">

              <div class="form-group">
                <label>Cardholder Name</label>
                <input
                  type="text"
                  [(ngModel)]="cardholderName"
                  name="cardholderName"
                  class="form-control"
                  placeholder="John Doe"
                />
              </div>

              <div class="form-group" style="margin-top:16px">
                <label>Card Details</label>
                <div #cardMount class="stripe-card-mount"></div>
              </div>

              @if (cardError()) {
                <div class="card-error">⚠️ {{ cardError() }}</div>
              }

              <div class="test-cards-info">
                <strong>Test cards:</strong> 4242 4242 4242 4242 (success) · 4000 0000 0000 0002 (decline)<br />
                Use any future expiry date and any 3-digit CVV.
              </div>

              <button
                class="btn btn--primary pay-btn"
                (click)="processCardPayment()"
                [disabled]="processing() || !stripeReady() || !bookingAmount()"
              >
                @if (processing()) {
                  <span class="spinner-inline"></span> Processing…
                } @else if (!stripeReady()) {
                  Loading payment system…
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

    /* Method Tabs */
    .pf-method-tabs {
      display: flex;
      gap: 8px;
      margin-bottom: 24px;
      background: var(--pf-surface);
      border: 1px solid var(--pf-border);
      border-radius: var(--radius-lg);
      padding: 6px;
    }

    .pf-method-tab {
      flex: 1;
      padding: 12px;
      border-radius: var(--radius-md);
      font-size: 14px;
      font-weight: 600;
      color: var(--pf-text-muted);
      background: none;
      transition: all 0.2s;
      cursor: pointer;
    }

    .pf-method-tab.active {
      background: rgba(34,211,238,0.1);
      color: var(--pf-primary);
      border: 1px solid rgba(34,211,238,0.2);
    }

    /* Demo Payment */
    .demo-payment { animation: fadeInUp 0.4s ease; }

    .demo-payment__info {
      background: rgba(34,211,238,0.05);
      border: 1px solid rgba(34,211,238,0.15);
      border-radius: var(--radius-lg);
      padding: 20px;
      margin-bottom: 20px;
    }

    .demo-payment__info h3 { font-size: 15px; color: var(--pf-primary); margin-bottom: 8px; }
    .demo-payment__info p { font-size: 14px; color: var(--pf-text-muted); line-height: 1.6; }

    .demo-payment__options { display: flex; flex-direction: column; gap: 12px; }

    .demo-btn {
      width: 100%;
      padding: 20px 24px;
      border-radius: var(--radius-lg);
      font-size: 16px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: space-between;
      transition: all 0.25s;
      cursor: pointer;
    }

    .demo-btn span { font-size: 13px; font-weight: 400; opacity: 0.8; }
    .demo-btn:disabled { opacity: 0.4; cursor: not-allowed; }

    .demo-btn--success {
      background: linear-gradient(135deg, rgba(34,197,94,0.15), rgba(34,197,94,0.05));
      border: 1px solid rgba(34,197,94,0.3);
      color: #22c55e;
    }

    .demo-btn--success:not(:disabled):hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 30px rgba(34,197,94,0.2);
    }

    .demo-btn--failure {
      background: linear-gradient(135deg, rgba(239,68,68,0.15), rgba(239,68,68,0.05));
      border: 1px solid rgba(239,68,68,0.3);
      color: #ef4444;
    }

    .demo-btn--failure:not(:disabled):hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 30px rgba(239,68,68,0.2);
    }

    .loading-hint {
      text-align: center;
      color: var(--pf-text-muted);
      font-size: 13px;
      margin-top: 16px;
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
  `],
})
export class PaymentFormComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('cardMount') cardMountRef!: ElementRef;

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private http = inject(HttpClient);
  private paymentService = inject(PaymentService);

  // Stripe internals
  private stripe: Stripe | null = null;
  private cardElement: StripeCardElement | null = null;

  // Component state
  step = signal<PaymentStep>('details');
  paymentMethod = signal<'mock' | 'card'>('mock');
  processing = signal(false);
  processingStepIdx = signal(-1);
  stripeReady = signal(false);

  booking = signal<any>(null);
  bookingId = signal(0);
  bookingRef = signal('');
  bookingAmount = signal(0);
  bookingLoadError = signal('');
  cardError = signal('');

  cardholderName = '';

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
    this.cardElement?.destroy();
  }

  // ─── Booking ────────────────────────────────────────────────────────────────

  loadBooking(id: number) {
    this.bookingLoadError.set('');
    this.http.get<any>(`${environment.apiUrl}/bookings/${id}`).subscribe({
      next: b => {
        this.booking.set(b);
        this.bookingAmount.set(b.total_amount);
        this.bookingLoadError.set('');
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

  // ─── Stripe Setup ────────────────────────────────────────────────────────────

  private async initStripe() {
    try {
      this.stripe = await loadStripe(environment.stripePublishableKey);
      if (!this.stripe) return;

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

      this.cardElement.mount(this.cardMountRef.nativeElement);

      this.cardElement.on('change', event => {
        this.cardError.set(event.error?.message ?? '');
      });

      this.stripeReady.set(true);
    } catch {
      this.stripeReady.set(false);
    }
  }

  // ─── Tab Switch ──────────────────────────────────────────────────────────────

  switchTab(method: 'mock' | 'card') {
    this.paymentMethod.set(method);
    this.cardError.set('');
  }

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
          next: () => {
            this.router.navigate(['/success'], {
              queryParams: {
                ref: txnRef,
                amount: this.bookingAmount(),
                booking_id: this.bookingId(),
                booking_ref: this.bookingRef() || this.booking()?.booking_ref,
              },
            });
          },
          error: () => {
            // Still navigate to success — payment was simulated
            this.router.navigate(['/success'], {
              queryParams: {
                ref: txnRef,
                amount: this.bookingAmount(),
                booking_id: this.bookingId(),
                booking_ref: this.bookingRef() || this.booking()?.booking_ref,
              },
            });
          },
        });
      } else {
        const failReason = 'Card declined (demo)';
        this.paymentService.recordFailure(this.bookingId(), failReason).subscribe();
        this.router.navigate(['/failure'], {
          queryParams: { booking_id: this.bookingId(), reason: failReason },
        });
      }
    });
  }

  // ─── Real Stripe Card Payment ────────────────────────────────────────────────

  async processCardPayment() {
    this.cardError.set('');

    if (!this.bookingAmount()) {
      this.cardError.set('Booking details are still loading. Please wait or refresh.');
      return;
    }
    if (!this.cardholderName.trim()) {
      this.cardError.set('Please enter the cardholder name.');
      return;
    }
    if (!this.stripe || !this.cardElement) {
      this.cardError.set('Payment system is not ready. Please refresh the page.');
      return;
    }

    this.processing.set(true);
    this.step.set('processing');

    // Run animation in parallel
    const animDone = this.runProcessingAnimation();

    // Step 1: Create PaymentIntent on backend
    this.paymentService.createPaymentIntent(this.bookingId(), 'card').subscribe({
      next: async intent => {
        // Step 2: Confirm payment with Stripe.js (tokenises card securely)
        const { error, paymentIntent } = await this.stripe!.confirmCardPayment(
          intent.client_secret,
          {
            payment_method: {
              card: this.cardElement!,
              billing_details: { name: this.cardholderName },
            },
          }
        );

        await animDone;

        if (error) {
          // Record failure in backend
          this.paymentService
            .recordFailure(this.bookingId(), error.message || 'Card declined')
            .subscribe();

          this.step.set('details');
          this.processing.set(false);
          this.cardError.set(error.message || 'Payment failed. Please try again.');
          return;
        }

        if (paymentIntent?.status === 'succeeded') {
          // Step 3: Record confirmed transaction in backend
          const txnRef = 'TXN-' + paymentIntent.id.slice(-12).toUpperCase();
          this.paymentService
            .confirmPayment({
              booking_id: this.bookingId(),
              transaction_ref: txnRef,
              payment_intent_id: paymentIntent.id,
              payment_method: 'card',
            })
            .subscribe({
              next: () => {
                this.router.navigate(['/success'], {
                  queryParams: {
                    ref: txnRef,
                    amount: this.bookingAmount(),
                    booking_id: this.bookingId(),
                    booking_ref: this.bookingRef() || this.booking()?.booking_ref,
                  },
                });
              },
              error: () => {
                // Stripe already processed the charge — navigate to success regardless
                this.router.navigate(['/success'], {
                  queryParams: {
                    ref: txnRef,
                    amount: this.bookingAmount(),
                    booking_id: this.bookingId(),
                    booking_ref: this.bookingRef() || this.booking()?.booking_ref,
                  },
                });
              },
            });
        }
      },
      error: () => {
        this.step.set('details');
        this.processing.set(false);
        this.cardError.set('Failed to create payment session. Please try again.');
      },
    });
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
