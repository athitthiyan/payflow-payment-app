import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-success',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="success-page">
      <div class="success-page__bg">
        <div class="success-bg-orb"></div>
        <div class="bg-grid"></div>
      </div>

      <div class="success-card">
        <!-- Animated checkmark -->
        <div class="success-card__icon">
          <div class="checkmark-ring"></div>
          <svg viewBox="0 0 52 52" class="checkmark-svg">
            <circle class="checkmark-circle" cx="26" cy="26" r="24" />
            <path class="checkmark-path" d="M14 27l8 8 16-16" />
          </svg>
        </div>

        <h1>Payment <span>Successful!</span></h1>
        <p>Your booking has been confirmed. Get ready for an amazing stay!</p>

        <div class="success-card__ref">
          <span>Transaction Reference</span>
          <strong>{{ transactionRef }}</strong>
        </div>

        <div class="success-card__amount">
          Amount Charged: <strong>₹{{ amount | number:'1.2-2' }}</strong>
        </div>

        <div class="success-card__actions">
          <a [href]="bookingAppUrl" class="btn btn--success btn--lg">🏨 View My Booking</a>
        </div>

        <div class="success-card__links">
          <p>Your invoice, voucher, and booking details are now available from your Stayvora booking page.</p>
        </div>

        <!-- Confetti dots -->
        <div class="confetti">
          @for (c of confettiItems; track $index) {
            <span [style]="c.style">{{ c.emoji }}</span>
          }
        </div>
      </div>
    </div>
  `,
  styles: [`
    .success-page {
      position: relative;
      min-height: 100vh;
      padding-top: 72px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .success-page__bg {
      position: fixed;
      inset: 0;
      background: var(--sv-gradient);
      z-index: -1;
      overflow: hidden;
    }

    .success-bg-orb {
      position: absolute;
      width: 600px;
      height: 600px;
      background: radial-gradient(ellipse, rgba(34,197,94,0.08), transparent 60%);
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      animation: pulse-glow 2s ease infinite;
    }

    .bg-grid {
      position: absolute;
      inset: 0;
      background-image:
        linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px);
      background-size: 50px 50px;
    }

    .success-card {
      position: relative;
      background: var(--sv-surface);
      border: 1px solid rgba(34,197,94,0.3);
      border-radius: var(--radius-xl);
      padding: clamp(24px, 6vw, 60px) clamp(24px, 5vw, 48px);
      text-align: center;
      max-width: 540px;
      width: calc(100% - clamp(24px, 6vw, 48px));
      margin: clamp(16px, 4vw, 32px) auto;
      box-shadow: 0 0 80px rgba(34,197,94,0.1), var(--sv-shadow);
      animation: fadeInUp 0.6s ease;
      overflow: hidden;

      h1 {
        font-family: 'Space Grotesk', sans-serif;
        font-size: clamp(1.6rem, 5vw, 2.5rem);
        color: white;
        margin: clamp(16px, 3vw, 24px) 0 clamp(8px, 2vw, 12px);
        span { color: #22c55e; }
      }

      p { font-size: clamp(14px, 2.5vw, 16px); color: var(--sv-text-muted); margin-bottom: clamp(16px, 4vw, 32px); }
    }

    .success-card__icon {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 100px;
      height: 100px;
      margin: 0 auto;
    }

    .success-card__ref {
      background: var(--sv-surface-2);
      border: 1px solid var(--sv-border-2);
      border-radius: var(--radius-lg);
      padding: clamp(14px, 3vw, 20px);
      margin-bottom: clamp(12px, 2vw, 16px);

      span {
        display: block;
        font-size: clamp(9px, 1.5vw, 11px);
        text-transform: uppercase;
        letter-spacing: 1px;
        color: var(--sv-text-muted);
        margin-bottom: clamp(6px, 1.5vw, 8px);
      }

      strong {
        font-family: monospace;
        font-size: clamp(1rem, 2.5vw, 1.3rem);
        color: #22c55e;
        letter-spacing: 1px;
        word-break: break-all;
      }
    }

    .success-card__amount {
      font-size: 14px;
      color: var(--sv-text-muted);
      margin-bottom: 32px;

      strong { color: white; font-size: 16px; }
    }

    .success-card__actions {
      display: flex;
      gap: 12px;
      justify-content: center;
      flex-wrap: wrap;
      margin-bottom: 32px;
    }

    .success-card__links {
      font-size: 13px;
      color: var(--sv-text-muted);

      .link-cyan {
        color: var(--sv-primary);
        font-weight: 600;
        display: block;
        margin-top: 4px;
      }
    }

    .checkmark-ring {
      position: absolute;
      inset: 0;
      border-radius: 50%;
      border: 3px solid rgba(34,197,94,0.3);
      animation: pulse-ring 1.5s ease-out 0.5s forwards;
    }

    @keyframes pulse-ring {
      0%   { transform: scale(1); opacity: 1; }
      100% { transform: scale(1.5); opacity: 0; }
    }

    .checkmark-svg {
      width: 80px;
      height: 80px;
    }

    .checkmark-circle {
      fill: none;
      stroke: #22c55e;
      stroke-width: 3;
      stroke-dasharray: 166;
      stroke-dashoffset: 166;
      animation: dash 0.6s ease 0.2s forwards;
    }

    .checkmark-path {
      fill: none;
      stroke: #22c55e;
      stroke-width: 3;
      stroke-linecap: round;
      stroke-linejoin: round;
      stroke-dasharray: 50;
      stroke-dashoffset: 50;
      animation: dash 0.4s ease 0.8s forwards;
    }

    @keyframes dash {
      to { stroke-dashoffset: 0; }
    }

    .confetti {
      position: absolute;
      inset: 0;
      pointer-events: none;

      span {
        position: absolute;
        font-size: 20px;
        animation: fall 3s ease-out forwards;
      }
    }

    @keyframes fall {
      0%   { opacity: 1; transform: translateY(-20px) rotate(0deg); }
      100% { opacity: 0; transform: translateY(200px) rotate(360deg); }
    }
  `],
})
export class SuccessComponent implements OnInit {
  private route = inject(ActivatedRoute);

  transactionRef = '';
  amount = 0;
  bookingAppUrl = environment.bookingAppUrl;
  bookingRef = '';
  bookingId = '';

  confettiItems = Array.from({ length: 12 }, (_, i) => ({
    emoji: ['🎉', '✨', '🎊', '⭐', '💫', '🌟'][i % 6],
    style: `left:${Math.random() * 100}%;top:${Math.random() * 40}%;animation-delay:${Math.random() * 1}s`
  }));

  ngOnInit() {
    // M-09: Validate and sanitize query parameters
    this.transactionRef = this.validateTransactionRef(this.route.snapshot.queryParamMap.get('ref')) || 'TXN-PENDING';
    this.amount = this.validateAmount(this.route.snapshot.queryParamMap.get('amount'));
    this.bookingRef = this.sanitizeRef(this.route.snapshot.queryParamMap.get('booking_ref')) || '';
    this.bookingId = this.sanitizeRef(this.route.snapshot.queryParamMap.get('booking_id')) || '';

    const bookingUrl = new URL('/booking-confirmation', this.bookingAppUrl);
    if (this.bookingRef) bookingUrl.searchParams.set('ref', this.bookingRef);
    if (this.bookingId) bookingUrl.searchParams.set('booking_id', this.bookingId);
    this.bookingAppUrl = bookingUrl.toString();
  }

  private validateTransactionRef(ref: string | null): string {
    if (!ref) return '';
    // Only allow alphanumeric, hyphen, underscore
    return /^[a-zA-Z0-9_-]{3,50}$/.test(ref) ? ref : '';
  }

  private validateAmount(amount: string | null): number {
    if (!amount) return 0;
    const num = Number(amount);
    // Ensure it's a positive number and not NaN
    return Number.isFinite(num) && num > 0 ? num : 0;
  }

  private sanitizeRef(ref: string | null): string {
    if (!ref) return '';
    // Strip HTML and only allow safe alphanumeric characters with common separators
    return /^[a-zA-Z0-9_-]{1,100}$/.test(ref) ? ref : '';
  }
}
