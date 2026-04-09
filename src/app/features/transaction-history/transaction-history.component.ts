import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { PaymentService } from '../../core/services/payment.service';
import { Transaction } from '../../core/models/transaction.model';

@Component({
  selector: 'app-transaction-history',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  template: `
    <div class="txn-page">
      <div class="container">
        <div class="txn-header">
          <div>
            <h1>Transaction <span>History</span></h1>
            <p>All payment transactions processed through Stayvora Pay</p>
          </div>
          <div class="txn-header__filter">
            <select [(ngModel)]="statusFilter" (change)="loadTransactions()" class="form-control">
              <option value="">All Status</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
              <option value="pending">Pending</option>
              <option value="refunded">Refunded</option>
            </select>
          </div>
        </div>

        <!-- Stats Row -->
        <div class="txn-stats">
          @for (stat of stats; track stat.label) {
            <div class="stat-card">
              <span class="stat-card__icon">{{ stat.icon }}</span>
              <div>
                <strong>{{ stat.value }}</strong>
                <span>{{ stat.label }}</span>
              </div>
            </div>
          }
        </div>

        <!-- Table -->
        @if (loading()) {
          <div class="txn-table-wrap">
            @for (s of [1,2,3,4,5]; track s) {
              <div class="skeleton" style="height:64px;border-radius:12px;margin-bottom:8px"></div>
            }
          </div>
        } @else if (transactions().length === 0) {
          <div class="txn-empty">
            <span>💳</span>
            <h3>No transactions yet</h3>
            <p>Transactions will appear here once payments are processed.</p>
          </div>
        } @else {
          <div class="txn-table-wrap">
            <table class="txn-table">
              <thead>
                <tr>
                  <th>Ref</th>
                  <th>Guest</th>
                  <th>Hotel</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                @for (txn of transactions(); track txn.id) {
                  <tr class="txn-row">
                    <td class="txn-ref">{{ txn.transaction_ref }}</td>
                    <td>{{ txn.booking?.user_name || '—' }}</td>
                    <td>{{ txn.booking?.room?.hotel_name || '—' }}</td>
                    <td class="txn-amount">₹{{ txn.amount | number:'1.2-2' }}</td>
                    <td>
                      <span class="txn-method">
                        {{ txn.card_brand || txn.payment_method }}
                        @if (txn.card_last4) { •••• {{ txn.card_last4 }} }
                      </span>
                    </td>
                    <td>
                      <span class="badge" [class]="getBadgeClass(txn.status)">
                        {{ txn.status | titlecase }}
                      </span>
                    </td>
                    <td class="txn-date">{{ txn.created_at | date:'MMM d, HH:mm' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          @if (total() > transactions().length) {
            <div class="txn-pagination">
              <button class="btn btn--ghost btn--sm" (click)="loadMore()">Load More</button>
            </div>
          }
        }
      </div>
    </div>
  `,
  styles: [`
    .txn-page {
      padding-top: clamp(70px, 10vw, 100px);
      padding-bottom: clamp(40px, 8vw, 80px);
      min-height: 100vh;
    }

    .txn-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-bottom: clamp(16px, 4vw, 32px);

      h1 {
        font-family: 'Playfair Display', Georgia, serif;
        font-size: clamp(1.4rem, 5vw, 2rem);
        color: white;
        span { color: var(--sv-gold); }
      }

      p { font-size: clamp(12px, 2.5vw, 14px); color: var(--sv-text-muted); margin-top: 6px; }

      @media (max-width: 600px) { flex-direction: column; align-items: flex-start; gap: 16px; }
    }

    .txn-header__filter select {
      min-width: 160px;
      padding: 10px 16px !important;
    }

    .txn-stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 32px;
    }

    .stat-card {
      display: flex;
      align-items: center;
      gap: clamp(12px, 2vw, 16px);
      padding: clamp(14px, 3vw, 20px);
      background: var(--sv-surface);
      border: 1px solid var(--sv-border);
      border-radius: var(--radius-lg);

      strong {
        display: block;
        font-size: clamp(1rem, 2.5vw, 1.3rem);
        font-weight: 800;
        color: white;
      }

      span { font-size: clamp(11px, 2vw, 13px); color: var(--sv-text-muted); }
    }

    .stat-card__icon { font-size: 1.8rem; }

    .txn-table-wrap {
      background: var(--sv-surface);
      border: 1px solid var(--sv-border);
      border-radius: var(--radius-xl);
      overflow: hidden;
    }

    .txn-table {
      width: 100%;
      border-collapse: collapse;

      th {
        padding: clamp(10px, 2vw, 14px) clamp(12px, 3vw, 20px);
        text-align: left;
        font-size: clamp(9px, 1.5vw, 11px);
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: var(--sv-gold);
        border-bottom: 1px solid var(--sv-border);
        background: rgba(214,184,107,0.03);
      }

      tbody tr:not(:last-child) { border-bottom: 1px solid var(--sv-border); }
    }

    .txn-row {
      td { padding: clamp(12px, 2vw, 16px) clamp(12px, 3vw, 20px); font-size: clamp(12px, 2vw, 14px); color: var(--sv-text-muted); }
      &:hover td { background: rgba(255,255,255,0.02); }
    }

    @media (max-width: 768px) {
      .txn-table th {
        padding: 10px 12px;
        font-size: 9px;
        letter-spacing: 0px;
      }

      .txn-row td {
        padding: 12px;
        font-size: 12px;
      }

      .txn-ref { font-size: 10px !important; }
      .txn-amount { font-size: 13px !important; }
      .txn-method { font-size: 11px; }
      .txn-date { font-size: 10px !important; }
    }

    .txn-ref {
      font-family: monospace;
      font-size: 12px !important;
      color: var(--sv-text-muted) !important;
    }

    .txn-amount { font-weight: 700; color: white !important; font-size: 15px !important; }

    .txn-method { font-size: 13px; }

    .txn-date { font-size: 12px !important; }

    .txn-empty {
      text-align: center;
      padding: clamp(40px, 10vw, 80px) clamp(16px, 4vw, 20px);
      span { font-size: clamp(2rem, 6vw, 3rem); display: block; margin-bottom: clamp(12px, 3vw, 16px); }
      h3 { font-size: clamp(1rem, 3vw, 1.3rem); color: white; margin-bottom: 8px; }
      p { color: var(--sv-text-muted); font-size: clamp(13px, 2vw, 14px); }
    }

    .txn-pagination {
      margin-top: 24px;
      display: flex;
      justify-content: center;
    }
  `],
})
export class TransactionHistoryComponent implements OnInit {
  private paymentService = inject(PaymentService);

  transactions = signal<Transaction[]>([]);
  loading = signal(true);
  total = signal(0);
  loadError = signal(false);
  page = 1;
  statusFilter = '';

  stats = [
    { icon: '💳', label: 'Total Transactions', value: '—' },
    { icon: '✅', label: 'Successful', value: '—' },
    { icon: '❌', label: 'Failed', value: '—' },
    { icon: '💰', label: 'Total Revenue', value: '—' },
  ];

  ngOnInit() {
    this.loadTransactions();
  }

  loadTransactions() {
    this.loading.set(true);
    this.page = 1;
    this.paymentService.getTransactions(this.statusFilter || undefined, 1, 20).subscribe({
      next: res => {
        this.transactions.set(res.transactions);
        this.total.set(res.total);
        this.loadError.set(false);
        this.loading.set(false);
        this.updateStats(res.transactions);
      },
      error: () => {
        this.transactions.set([]);
        this.total.set(0);
        this.loadError.set(true);
        this.loading.set(false);
        this.updateStats([]);
      },
    });
  }

  loadMore() {
    this.page++;
    this.paymentService.getTransactions(this.statusFilter || undefined, this.page, 20).subscribe({
      next: res => {
        this.transactions.update(current => [...current, ...res.transactions]);
      },
    });
  }

  getBadgeClass(status: string): string {
    const map: Record<string, string> = {
      success: 'badge--success',
      failed: 'badge--error',
      pending: 'badge--pending',
      refunded: 'badge--gold',
    };
    return map[status] || '';
  }

  private updateStats(txns: Transaction[]) {
    const success = txns.filter(t => t.status === 'success');
    const failed  = txns.filter(t => t.status === 'failed');
    const revenue = success.reduce((sum, t) => sum + t.amount, 0);

    this.stats[0].value = String(this.total());
    this.stats[1].value = String(success.length);
    this.stats[2].value = String(failed.length);
    this.stats[3].value = `₹${revenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  }

}
