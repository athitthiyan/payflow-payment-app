import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { PaymentService } from '../../core/services/payment.service';
import { environment } from '../../../environments/environment';

type PaymentStep = 'details' | 'processing' | 'done';
type CardBrand = 'visa' | 'mastercard' | 'amex' | 'unknown';

@Component({
  selector: 'app-payment-form',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  template: `
    <div class="payment-page">
      <!-- Animated background -->
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
              <div class="pf-header__badge">Secure Checkout</div>
              <h1 class="pf-header__title">Complete <span>Payment</span></h1>
              <p class="pf-header__sub">Your transaction is protected by 256-bit SSL encryption</p>
            </div>

            <!-- Payment Method Tabs -->
            <div class="pf-method-tabs">
              <button class="pf-method-tab" [class.active]="paymentMethod() === 'mock'" (click)="paymentMethod.set('mock')">
                <span>Demo</span> Demo Mode
              </button>
              <button class="pf-method-tab" [class.active]="paymentMethod() === 'card'" (click)="paymentMethod.set('card')">
                <span>Card</span> Credit Card (Stripe)
              </button>
            </div>

            @if (paymentMethod() === 'mock') {
              <!-- Demo Payment -->
              <div class="demo-payment">
                <div class="demo-payment__info">
                  <h3>Demo Payment Mode</h3>
                  <p>This simulates a real payment without charging any card. Perfect for portfolio demonstrations.</p>
                </div>
                <div class="demo-payment__options">
                  <button class="demo-btn demo-btn--success" (click)="processMockPayment(true)">
                    Simulate Successful Payment
                    <span>-> \${{ bookingAmount() | number:'1.0-0' }} charged</span>
                  </button>
                  <button class="demo-btn demo-btn--failure" (click)="processMockPayment(false)">
                    Simulate Failed Payment
                    <span>-> Card declined</span>
                  </button>
                </div>
              </div>
            } @else {
              <!-- Real Card Form -->
              <form class="card-form" (ngSubmit)="processCardPayment()">
                <div class="form-group">
                  <label>Cardholder Name</label>
                  <input type="text" [(ngModel)]="cardForm.name" name="name" class="form-control" placeholder="John Doe" required />
                </div>

                <div class="form-group" style="margin-top:16px">
                  <label>Card Number</label>
                  <div class="card-input-wrap">
                    <input
                      type="text"
                      [(ngModel)]="cardForm.number"
                      name="number"
                      class="form-control card-input"
                      placeholder="1234 5678 9012 3456"
                      maxlength="19"
                      (input)="formatCardNumber($event)"
                      required
                    />
                    <span class="card-brand-icon">{{ cardBrandIcon() }}</span>
                  </div>
                </div>

                <div class="form-row" style="margin-top:16px">
                  <div class="form-group">
                    <label>Expiry Date</label>
                    <input type="text" [(ngModel)]="cardForm.expiry" name="expiry" class="form-control" placeholder="MM / YY" maxlength="7" (input)="formatExpiry($event)" required />
                  </div>
                  <div class="form-group">
                    <label>CVV</label>
                    <div style="position:relative">
                      <input type="password" [(ngModel)]="cardForm.cvv" name="cvv" class="form-control" placeholder="***" maxlength="4" required />
                    </div>
                  </div>
                </div>

                <!-- Test cards info -->
                <div class="test-cards-info">
                  <p><strong>Test cards:</strong> 4242 4242 4242 4242 (success) · 4000 0000 0000 0002 (decline)</p>
                  <p>Use any future date and any 3-digit CVV.</p>
                </div>

                <button type="submit" class="btn btn--primary" style="width:100%;margin-top:20px;padding:18px;font-size:16px" [disabled]="processing()">
                  @if (processing()) {
                    <span class="spinner-inline"></span> Processing...
                  } @else {
                    Pay \${{ bookingAmount() | number:'1.0-0' }} Securely
                  }
                </button>
              </form>
            }

            <!-- Trust Footer -->
            <div class="pf-trust">
              <span>SSL Encrypted</span>
              <span>Bank-level Security</span>
              <span>100% Secure</span>
            </div>
          }

          @if (step() === 'processing') {
            <div class="processing-state">
              <div class="processing-state__spinner">
                <div class="spinner-ring"></div>
                <span>Card</span>
              </div>
              <h2>Processing Payment...</h2>
              <p>Please wait while we securely process your payment.</p>
              <div class="processing-steps">
                @for (s of processingSteps; track s.label; let i = $index) {
                  <div class="processing-step" [class.active]="processingStepIdx() >= i" [class.done]="processingStepIdx() > i">
                    <span class="processing-step__icon">{{ processingStepIdx() > i ? 'Done' : (processingStepIdx() === i ? '...' : 'o') }}</span>
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

            <div class="payment-summary__booking">
              @if (booking()) {
                <div class="payment-summary__room">
                  <span class="payment-summary__room-label">Hotel</span>
                  <strong>{{ booking()?.room?.hotel_name || 'Premium Room' }}</strong>
                  <span class="payment-summary__room-loc">{{ booking()?.room?.location || 'Location' }}</span>
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
            </div>

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
              <div class="security-item">256-bit SSL encryption</div>
              <div class="security-item">PCI DSS compliant</div>
              <div class="security-item">Free cancellation (48h)</div>
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

      @media (max-width: 1024px) { grid-template-columns: 1fr; }
    }

    .bg-orb {
      position: absolute;
      border-radius: 50%;
      filter: blur(80px);
      pointer-events: none;
    }

    .bg-orb--1 {
      width: 500px;
      height: 500px;
      background: rgba(34,211,238,0.04);
      top: -100px;
      right: -100px;
      animation: float 8s ease-in-out infinite;
    }

    .bg-orb--2 {
      width: 400px;
      height: 400px;
      background: rgba(34,197,94,0.03);
      bottom: -100px;
      left: -80px;
      animation: float 10s ease-in-out infinite 3s;
    }

    @keyframes float {
      0%,100% { transform: translateY(0); }
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
    .pf-header {
      margin-bottom: 32px;
      animation: fadeInUp 0.5s ease;
    }

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

      span { color: var(--pf-primary); }
    }

    .pf-header__sub {
      font-size: 14px;
      color: var(--pf-text-muted);
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
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;

      &.active {
        background: rgba(34,211,238,0.1);
        color: var(--pf-primary);
        border: 1px solid rgba(34,211,238,0.2);
      }
    }

    /* Demo Payment */
    .demo-payment {
      animation: fadeInUp 0.4s ease;
    }

    .demo-payment__info {
      background: rgba(34,211,238,0.05);
      border: 1px solid rgba(34,211,238,0.15);
      border-radius: var(--radius-lg);
      padding: 20px;
      margin-bottom: 20px;

      h3 { font-size: 15px; color: var(--pf-primary); margin-bottom: 8px; }
      p { font-size: 14px; color: var(--pf-text-muted); line-height: 1.6; }
    }

    .demo-payment__options {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

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
      position: relative;
      overflow: hidden;

      span {
        font-size: 13px;
        font-weight: 400;
        opacity: 0.8;
      }

      &::before {
        content: '';
        position: absolute;
        inset: 0;
        opacity: 0;
        transition: opacity 0.2s;
      }

      &:hover::before { opacity: 1; }
    }

    .demo-btn--success {
      background: linear-gradient(135deg, rgba(34,197,94,0.15), rgba(34,197,94,0.05));
      border: 1px solid rgba(34,197,94,0.3);
      color: #22c55e;
    }

    .demo-btn--success::before { background: rgba(34,197,94,0.08); }
    .demo-btn--success:hover { transform: translateY(-2px); box-shadow: 0 8px 30px rgba(34,197,94,0.2); }

    .demo-btn--failure {
      background: linear-gradient(135deg, rgba(239,68,68,0.15), rgba(239,68,68,0.05));
      border: 1px solid rgba(239,68,68,0.3);
      color: #ef4444;
    }

    .demo-btn--failure::before { background: rgba(239,68,68,0.08); }
    .demo-btn--failure:hover { transform: translateY(-2px); box-shadow: 0 8px 30px rgba(239,68,68,0.2); }

    /* Card Form */
    .card-form {
      animation: fadeInUp 0.4s ease;
    }

    .card-input-wrap {
      position: relative;
    }

    .card-input { padding-right: 50px !important; }

    .card-brand-icon {
      position: absolute;
      right: 14px;
      top: 50%;
      transform: translateY(-50%);
      font-size: 20px;
    }

    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }

    .test-cards-info {
      background: rgba(245,158,11,0.08);
      border: 1px solid rgba(245,158,11,0.2);
      border-radius: var(--radius-md);
      padding: 14px;
      margin-top: 16px;
      font-size: 12px;
      color: #f59e0b;
      line-height: 1.6;
    }

    /* Trust */
    .pf-trust {
      display: flex;
      gap: 20px;
      justify-content: center;
      flex-wrap: wrap;
      margin-top: 24px;
      padding-top: 20px;
      border-top: 1px solid var(--pf-border);

      span {
        font-size: 12px;
        color: var(--pf-text-muted);
        font-weight: 500;
      }
    }

    /* Processing State */
    .processing-state {
      text-align: center;
      padding: 60px 20px;
      animation: fadeInUp 0.5s ease;

      h2 {
        font-family: 'Space Grotesk', sans-serif;
        font-size: 1.8rem;
        color: white;
        margin-bottom: 8px;
      }

      p { font-size: 15px; color: var(--pf-text-muted); margin-bottom: 32px; }
    }

    .processing-state__spinner {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 32px;

      span {
        font-size: 2.5rem;
        z-index: 1;
        animation: pulse-glow 1.5s ease infinite;
      }
    }

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

      &.active { border-color: rgba(34,211,238,0.3); color: var(--pf-primary); }
      &.done { border-color: rgba(34,197,94,0.3); color: #22c55e; }
    }

    .processing-step__icon { font-size: 16px; }

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
    .payment-summary {
      position: sticky;
      top: 90px;
    }

    .payment-summary__card {
      background: var(--pf-surface);
      border: 1px solid var(--pf-border-2);
      border-radius: var(--radius-xl);
      padding: 28px;
      box-shadow: var(--pf-shadow);
      animation: fadeInUp 0.5s ease 0.1s both;

      h3 {
        font-family: 'Space Grotesk', sans-serif;
        font-size: 1.2rem;
        color: white;
        margin-bottom: 16px;
      }
    }

    .payment-summary__room {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-bottom: 16px;

      strong { font-size: 16px; color: white; }
      span { font-size: 13px; color: var(--pf-text-muted); }
    }

    .payment-summary__room-label {
      font-size: 11px !important;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--pf-primary) !important;
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

      div {
        text-align: center;

        span { display: block; font-size: 11px; color: var(--pf-text-muted); margin-bottom: 4px; }
        strong { font-size: 14px; color: white; }
      }
    }

    .payment-summary__nights {
      text-align: center;

      span:first-child {
        display: block;
        font-size: 1.5rem !important;
        font-weight: 800 !important;
        color: var(--pf-primary) !important;
      }
    }

    .payment-summary__amount { display: flex; flex-direction: column; gap: 8px; }

    .payment-summary__security {
      margin-top: 20px;
      padding-top: 16px;
      border-top: 1px solid var(--pf-border);
      display: flex;
      flex-direction: column;
      gap: 8px;

      .security-item { font-size: 13px; color: var(--pf-text-muted); }
    }

    .amount-row {
      display: flex;
      justify-content: space-between;
      font-size: 14px;
      color: var(--pf-text-muted);
    }

    .amount-row--total {
      font-weight: 700;
      font-size: 16px;
      color: white;
    }

    .amount-total {
      font-size: 1.4rem;
      font-weight: 800;
      color: var(--pf-primary);
    }
  `],
})
export class PaymentFormComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private http = inject(HttpClient);
  private paymentService = inject(PaymentService);

  step = signal<PaymentStep>('details');
  paymentMethod = signal<'mock' | 'card'>('mock');
  processing = signal(false);
  processingStepIdx = signal(-1);
  booking = signal<any>(null);
  bookingId = signal(0);
  bookingRef = signal('');
  bookingAmount = signal(0);
  cardBrandIcon = signal('Card');

  cardForm = { name: '', number: '', expiry: '', cvv: '' };

  processingSteps = [
    { label: 'Validating card details' },
    { label: 'Contacting payment network' },
    { label: 'Authorizing transaction' },
    { label: 'Confirming booking' },
  ];

  ngOnInit() {
    const id = this.route.snapshot.queryParamMap.get('booking_id');
    const ref = this.route.snapshot.queryParamMap.get('ref');
    if (id) this.bookingId.set(+id);
    if (ref) this.bookingRef.set(ref);

    // Fetch booking details
    if (id) {
      this.http.get<any>(`${environment.apiUrl}/bookings/${id}`).subscribe({
        next: b => {
          this.booking.set(b);
          this.bookingAmount.set(b.total_amount);
        },
        error: () => {
          // Mock fallback
          this.bookingAmount.set(987.5);
        }
      });
    } else {
      this.bookingAmount.set(987.5);
    }
  }

  processMockPayment(success: boolean) {
    this.step.set('processing');
    this.runProcessingAnimation().then(() => {
      if (success) {
        const txnRef = 'TXN-' + Math.random().toString(36).substring(2, 12).toUpperCase();
        if (this.bookingId()) {
          this.paymentService.confirmPayment({
            booking_id: this.bookingId(),
            transaction_ref: txnRef,
            payment_method: 'mock',
          }).subscribe({
            next: () => this.router.navigate(['/success'], { queryParams: { ref: txnRef, amount: this.bookingAmount() } }),
            error: () => this.router.navigate(['/success'], { queryParams: { ref: txnRef, amount: this.bookingAmount() } }),
          });
        } else {
          const ref = 'TXN-' + Math.random().toString(36).substring(2, 12).toUpperCase();
          this.router.navigate(['/success'], { queryParams: { ref, amount: this.bookingAmount() } });
        }
      } else {
        this.router.navigate(['/failure'], { queryParams: { booking_id: this.bookingId(), reason: 'Card declined' } });
      }
    });
  }

  processCardPayment() {
    if (!this.cardForm.name || !this.cardForm.number || !this.cardForm.expiry || !this.cardForm.cvv) {
      return;
    }
    // In production: use Stripe.js to tokenize card before sending
    // For demo: simulate
    this.processing.set(true);
    const isTestSuccess = this.cardForm.number.replace(/\s/g, '') === '4242424242424242';
    setTimeout(() => {
      this.processing.set(false);
      this.processMockPayment(isTestSuccess);
    }, 1000);
  }

  private async runProcessingAnimation(): Promise<void> {
    return new Promise(resolve => {
      let i = 0;
      const interval = setInterval(() => {
        this.processingStepIdx.set(i);
        i++;
        if (i >= this.processingSteps.length) {
          clearInterval(interval);
          setTimeout(resolve, 600);
        }
      }, 600);
    });
  }

  formatCardNumber(event: Event) {
    const input = event.target as HTMLInputElement;
    let v = input.value.replace(/\D/g, '').substring(0, 16);
    v = v.replace(/(.{4})/g, '$1 ').trim();
    this.cardForm.number = v;
    input.value = v;

    // Detect brand
    const num = v.replace(/\s/g, '');
    if (num.startsWith('4')) this.cardBrandIcon.set('Visa');
    else if (num.startsWith('5')) this.cardBrandIcon.set('MC');
    else if (num.startsWith('3')) this.cardBrandIcon.set('Amex');
    else this.cardBrandIcon.set('Card');
  }

  formatExpiry(event: Event) {
    const input = event.target as HTMLInputElement;
    let v = input.value.replace(/\D/g, '').substring(0, 4);
    if (v.length > 2) v = v.substring(0, 2) + ' / ' + v.substring(2);
    this.cardForm.expiry = v;
    input.value = v;
  }
}
