import { Component, OnInit, inject } from '@angular/core';
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
        <div class="failure-card__icon">❌</div>
        <h1>Payment <span>Failed</span></h1>
        <p>{{ reason }}</p>

        <div class="failure-card__suggestions">
          <h4>What you can do:</h4>
          <ul>
            <li>✅ Check your card details and try again</li>
            <li>✅ Make sure you have sufficient funds</li>
            <li>✅ Contact your bank if the issue persists</li>
            <li>✅ Try a different payment method</li>
          </ul>
        </div>

        <div class="failure-card__actions">
          <a routerLink="/" [queryParams]="{ booking_id: bookingId }" class="btn btn--primary btn--lg">🔄 Try Again</a>
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

      h1 {
        font-family: 'Space Grotesk', sans-serif;
        font-size: 2.2rem;
        color: white;
        margin-bottom: 12px;
        span { color: #ef4444; }
      }

      & > p {
        font-size: 15px;
        color: var(--pf-text-muted);
        margin-bottom: 32px;
        padding: 12px 20px;
        background: rgba(239,68,68,0.08);
        border: 1px solid rgba(239,68,68,0.2);
        border-radius: var(--radius-md);
      }
    }

    .failure-card__icon {
      font-size: 4rem;
      margin-bottom: 24px;
      display: block;
    }

    .failure-card__suggestions {
      text-align: left;
      background: var(--pf-surface-2);
      border-radius: var(--radius-lg);
      padding: 20px;
      margin-bottom: 32px;

      h4 { font-size: 14px; color: white; margin-bottom: 12px; }

      ul {
        list-style: none;
        display: flex;
        flex-direction: column;
        gap: 8px;

        li { font-size: 14px; color: var(--pf-text-muted); }
      }
    }

    .failure-card__actions {
      display: flex;
      gap: 12px;
      justify-content: center;
      flex-wrap: wrap;
    }
  `],
})
export class FailureComponent implements OnInit {
  private route = inject(ActivatedRoute);
  reason = 'Your payment could not be processed.';
  bookingId = '';

  ngOnInit() {
    const r = this.route.snapshot.queryParamMap.get('reason');
    if (r) this.reason = r;
    this.bookingId = this.route.snapshot.queryParamMap.get('booking_id') || '';
  }
}
