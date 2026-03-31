import { Component } from '@angular/core';
import { RouterOutlet, RouterLink } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink],
  template: `
    <header class="payflow-header">
      <div class="payflow-header__inner">
        <a routerLink="/" class="payflow-header__logo">💳 Pay<span>Flow</span></a>
        <nav class="payflow-header__nav">
          <a routerLink="/">Checkout</a>
          <a routerLink="/transactions">Transactions</a>
        </nav>
        <div class="payflow-header__badge">
          <span>🔒 256-bit SSL</span>
        </div>
      </div>
    </header>
    <main>
      <router-outlet />
    </main>
  `,
  styles: [`
    .payflow-header {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 100;
      background: rgba(5, 10, 20, 0.95);
      backdrop-filter: blur(20px);
      border-bottom: 1px solid rgba(255,255,255,0.07);
      padding: 14px 0;

      &__inner {
        max-width: 1280px;
        margin: 0 auto;
        padding: 0 32px;
        display: flex;
        align-items: center;
        gap: 32px;
      }

      &__logo {
        font-family: 'Space Grotesk', sans-serif;
        font-size: 1.4rem;
        font-weight: 700;
        color: white;
        flex-shrink: 0;
        span { color: #22d3ee; }
      }

      &__nav {
        display: flex;
        gap: 24px;
        margin-left: auto;

        a {
          font-size: 14px;
          color: rgba(255,255,255,0.6);
          transition: color 0.2s;
          &:hover { color: white; }
        }
      }

      &__badge {
        font-size: 12px;
        color: rgba(255,255,255,0.5);
        border: 1px solid rgba(255,255,255,0.1);
        padding: 4px 12px;
        border-radius: 20px;
        flex-shrink: 0;
      }
    }
  `]
})
export class AppComponent {}
