import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';

@Component({
  selector: 'app-failure',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="failure-page">
      <div class="failure-page__bg">
        <div class="failure-bg-orb"></div>
      </div>

      <div class="failure-card">
        <div class="failure-card__icon">Payment failed</div>
        <h1>Payment <span>Failed</span></h1>
        <p>{{ reason }}</p>

        <div class="failure-card__suggestions">
          <h4>What you can do:</h4>
          <ul>
            <li>Check your card details and try again</li>
            <li>Make sure you have sufficient funds</li>
            <li>Contact your bank if the issue persists</li>
            <li>Try a different payment method</li>
          </ul>
        </div>

        <div class="failure-card__actions">
          <a routerLink="/pay" [queryParams]="{ booking_id: bookingId }" class="btn btn--primary btn--lg">
            Retry Payment
            @if (holdSecondsLeft > 0) {
              <span class="retry-meta">Hold expires in {{ holdMinutes() }}:{{ holdSecondsPad() }}</span>
            }
          </a>
          <a href="mailto:support@stayvora.co.in" class="btn btn--ghost">Contact Support</a>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .failure-page {
      position: relative;
      min-height: 100vh;
      padding-top: 72px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .failure-page__bg {
      position: fixed;
      inset: 0;
      background: var(--sv-gradient);
      z-index: -1;
    }

    .failure-bg-orb {
      position: absolute;
      width: 500px;
      height: 500px;
      background: radial-gradient(ellipse, rgba(239,68,68,0.06), transparent 60%);
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
    }

    .failure-card {
      background: var(--sv-surface);
      border: 1px solid rgba(239,68,68,0.3);
      border-radius: var(--radius-xl);
      padding: clamp(24px, 6vw, 60px) clamp(24px, 5vw, 48px);
      text-align: center;
      max-width: 520px;
      width: calc(100% - clamp(24px, 6vw, 48px));
      margin: clamp(16px, 4vw, 32px) auto;
      box-shadow: 0 0 60px rgba(239,68,68,0.1), var(--sv-shadow);
      animation: fadeInUp 0.5s ease;
    }

    .failure-card h1 {
      font-family: 'Space Grotesk', sans-serif;
      font-size: clamp(1.6rem, 5vw, 2.2rem);
      color: white;
      margin-bottom: clamp(8px, 2vw, 12px);
    }

    .failure-card h1 span { color: #ef4444; }

    .failure-card > p {
      font-size: clamp(13px, 2.5vw, 15px);
      color: var(--sv-text-muted);
      margin-bottom: clamp(16px, 4vw, 32px);
      padding: clamp(10px, 2vw, 12px) clamp(14px, 3vw, 20px);
      background: rgba(239,68,68,0.08);
      border: 1px solid rgba(239,68,68,0.2);
      border-radius: var(--radius-md);
      word-wrap: break-word;
      overflow-wrap: break-word;
    }

    .failure-card__icon {
      font-size: 1rem;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: #fca5a5;
      margin-bottom: 24px;
      display: block;
    }

    .failure-card__suggestions {
      text-align: left;
      background: var(--sv-surface-2);
      border-radius: var(--radius-lg);
      padding: clamp(14px, 3vw, 20px);
      margin-bottom: clamp(16px, 4vw, 32px);
    }

    .failure-card__suggestions h4 { font-size: clamp(12px, 2.5vw, 14px); color: white; margin-bottom: clamp(8px, 2vw, 12px); }

    .failure-card__suggestions ul {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: clamp(6px, 1.5vw, 8px);
    }

    .failure-card__suggestions li { font-size: clamp(12px, 2vw, 14px); color: var(--sv-text-muted); }

    .failure-card__actions {
      display: flex;
      gap: 12px;
      justify-content: center;
      flex-wrap: wrap;
    }

    .retry-meta {
      display: block;
      font-size: 12px;
      opacity: 0.8;
      margin-top: 6px;
    }
  `],
})
export class FailureComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);

  reason = 'Your payment could not be processed.';
  bookingId = '';
  holdExpiresAt = '';
  holdSecondsLeft = 0;
  private countdownInterval: ReturnType<typeof setInterval> | null = null;

  ngOnInit() {
    // M-09: Validate and sanitize query parameters
    const reason = this.route.snapshot.queryParamMap.get('reason');
    if (reason) this.reason = this.sanitizeReason(reason);
    this.bookingId = this.sanitizeRef(this.route.snapshot.queryParamMap.get('booking_id')) || '';
    this.holdExpiresAt = this.validateIsoDate(this.route.snapshot.queryParamMap.get('hold_expires_at')) || '';
    if (this.holdExpiresAt) {
      this.startCountdown(this.holdExpiresAt);
    }
  }

  private sanitizeReason(reason: string): string {
    if (!reason) return 'Your payment could not be processed.';
    // Remove any HTML tags and truncate to safe length
    const clean = reason.replace(/<[^>]*>/g, '').trim();
    return clean.length > 200 ? clean.substring(0, 200) : clean;
  }

  private sanitizeRef(ref: string | null): string {
    if (!ref) return '';
    // Only allow safe alphanumeric characters with common separators
    return /^[a-zA-Z0-9_-]{1,100}$/.test(ref) ? ref : '';
  }

  private validateIsoDate(date: string | null): string {
    if (!date) return '';
    // Basic ISO 8601 date validation
    try {
      const d = new Date(date);
      return Number.isFinite(d.getTime()) ? date : '';
    } catch {
      return '';
    }
  }

  ngOnDestroy() {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
  }

  holdMinutes(): string {
    return String(Math.floor(this.holdSecondsLeft / 60)).padStart(2, '0');
  }

  holdSecondsPad(): string {
    return String(this.holdSecondsLeft % 60).padStart(2, '0');
  }

  private startCountdown(holdExpiresAt: string) {
    const expiry = new Date(holdExpiresAt).getTime();
    const tick = () => {
      this.holdSecondsLeft = Math.max(0, Math.round((expiry - Date.now()) / 1000));
      if (this.holdSecondsLeft === 0 && this.countdownInterval) {
        clearInterval(this.countdownInterval);
        this.countdownInterval = null;
      }
    };
    tick();
    this.countdownInterval = setInterval(tick, 1000);
  }
}
