import { Component } from '@angular/core';
import { RouterOutlet, RouterLink } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink],
  template: `
    <header class="sv-header">
      <div class="sv-header__inner">
        <a routerLink="/" class="sv-header__logo">
          <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" width="28" height="28"><rect width="32" height="32" rx="8" fill="#0f2033"/><path d="M9 20C9 15 13 12 18 12C23 12 21 15.5 16.5 17C12 18.5 10.5 21.5 15 23C19.5 24.5 23 22 23 19.5" stroke="#d6b86b" stroke-width="2.4" stroke-linecap="round" fill="none"/></svg>
          <span>Stayvora <em>Pay</em></span>
        </a>
        <nav class="sv-header__nav">
          <a routerLink="/">Checkout</a>
          <a routerLink="/transactions">Transactions</a>
        </nav>
        <div class="sv-header__badge">
          <span>&#128274; 256-bit SSL</span>
        </div>
      </div>
    </header>
    <main>
      <router-outlet />
    </main>
  `,
  styles: [`
    .sv-header {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 100;
      background: rgba(7, 17, 25, 0.95);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border-bottom: 1px solid rgba(255,255,255,0.07);
      padding: 14px 0;
    }

    .sv-header__inner {
      max-width: 1280px;
      margin: 0 auto;
      padding: 0 var(--layout-padding-x);
      display: flex;
      align-items: center;
      gap: clamp(12px, 4vw, 32px);
      flex-wrap: wrap;
    }

    .sv-header__logo {
      display: flex;
      align-items: center;
      gap: clamp(6px, 2vw, 10px);
      font-family: 'Playfair Display', Georgia, serif;
      font-size: clamp(1rem, 2.5vw, 1.3rem);
      font-weight: 700;
      color: #f0f4ff;
      flex-shrink: 0;
      white-space: nowrap;
    }

    .sv-header__logo em {
      font-style: normal;
      color: #d6b86b;
    }

    .sv-header__nav {
      display: flex;
      gap: clamp(12px, 3vw, 24px);
      margin-left: auto;
      flex-shrink: 1;
    }

    .sv-header__nav a {
      font-size: clamp(12px, 2.5vw, 14px);
      color: rgba(255,255,255,0.6);
      transition: color 0.2s;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .sv-header__nav a:hover {
      color: #d6b86b;
    }

    .sv-header__badge {
      font-size: clamp(10px, 2vw, 12px);
      color: rgba(255,255,255,0.5);
      border: 1px solid rgba(255,255,255,0.1);
      padding: clamp(4px, 1vw, 8px) clamp(8px, 2vw, 12px);
      border-radius: 20px;
      flex-shrink: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    @media (max-width: 480px) {
      .sv-header__nav a {
        font-size: 11px;
      }

      .sv-header__badge {
        display: none;
      }
    }
  `]
})
export class AppComponent {}
