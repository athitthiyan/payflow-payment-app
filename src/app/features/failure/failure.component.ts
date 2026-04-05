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
          <a routerLink="/" [queryParams]="{ booking_id: bookingId }" class="btn btn--primary btn--lg">
            Retry Payment
            @if (holdSecondsLeft > 0) {
              <span class="retry-meta">Hold expires in {{ holdMinutes() }}:{{ holdSecondsPad() }}</span>
            }
          </a>
          <a href="mailto:support@stayease.com" class="btn btn--ghost">Contact Support</a>
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
      background: var(--pf-gradient);
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
      background: var(--pf-surface);
      border: 1px solid rgba(239,68,68,0.3);
      border-radius: var(--radius-xl);
      padding: 60px 48px;
      text-align: center;
      max-width: 520px;
      width: calc(100% - 48px);
      margin: 32px 24px;
      box-shadow: 0 0 60px rgba(239,68,68,0.1), var(--pf-shadow);
      animation: fadeInUp 0.5s ease;
    }

    .failure-card h1 {
      font-family: 'Space Grotesk', sans-serif;
      font-size: 2.2rem;
      color: white;
      margin-bottom: 12px;
    }

    .failure-card h1 span { color: #ef4444; }

    .failure-card > p {
      font-size: 15px;
      color: var(--pf-text-muted);
      margin-bottom: 32px;
      padding: 12px 20px;
      background: rgba(239,68,68,0.08);
      border: 1px solid rgba(239,68,68,0.2);
      border-radius: var(--radius-md);
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
      background: var(--pf-surface-2);
      border-radius: var(--radius-lg);
      padding: 20px;
      margin-bottom: 32px;
    }

    .failure-card__suggestions h4 { font-size: 14px; color: white; margin-bottom: 12px; }

    .failure-card__suggestions ul {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .failure-card__suggestions li { font-size: 14px; color: var(--pf-text-muted); }

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
    const reason = this.route.snapshot.queryParamMap.get('reason');
    if (reason) this.reason = reason;
    this.bookingId = this.route.snapshot.queryParamMap.get('booking_id') || '';
    this.holdExpiresAt = this.route.snapshot.queryParamMap.get('hold_expires_at') || '';
    if (this.holdExpiresAt) {
      this.startCountdown(this.holdExpiresAt);
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
