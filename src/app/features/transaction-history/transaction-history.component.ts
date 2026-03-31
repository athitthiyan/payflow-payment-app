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
            <p>All payment transactions processed through PayFlow</p>
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
                    <td class="txn-amount">\${{ txn.amount | number:'1.2-2' }}</td>
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
      padding-top: 100px;
      padding-bottom: 80px;
      min-height: 100vh;
    }

    .txn-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-bottom: 32px;

      h1 {
        font-family: 'Space Grotesk', sans-serif;
        font-size: 2rem;
        color: white;
        span { color: var(--pf-primary); }
      }

      p { font-size: 14px; color: var(--pf-text-muted); margin-top: 6px; }

      &__filter select {
        min-width: 160px;
        padding: 10px 16px !important;
      }

      @media (max-width: 600px) { flex-direction: column; align-items: flex-start; gap: 16px; }
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
      gap: 16px;
      padding: 20px;
      background: var(--pf-surface);
      border: 1px solid var(--pf-border);
      border-radius: var(--radius-lg);

      &__icon { font-size: 1.8rem; }

      strong {
        display: block;
        font-size: 1.3rem;
        font-weight: 800;
        color: white;
      }

      span { font-size: 13px; color: var(--pf-text-muted); }
    }

    .txn-table-wrap {
      background: var(--pf-surface);
      border: 1px solid var(--pf-border);
      border-radius: var(--radius-xl);
      overflow: hidden;
    }

    .txn-table {
      width: 100%;
      border-collapse: collapse;

      th {
        padding: 14px 20px;
        text-align: left;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 1px;
        color: var(--pf-primary);
        border-bottom: 1px solid var(--pf-border);
        background: rgba(34,211,238,0.03);
      }

      tbody tr:not(:last-child) { border-bottom: 1px solid var(--pf-border); }
    }

    .txn-row {
      td { padding: 16px 20px; font-size: 14px; color: var(--pf-text-muted); }
      &:hover td { background: rgba(255,255,255,0.02); }
    }

    .txn-ref {
      font-family: monospace;
      font-size: 12px !important;
      color: var(--pf-text-muted) !important;
    }

    .txn-amount { font-weight: 700; color: white !important; font-size: 15px !important; }

    .txn-method { font-size: 13px; }

    .txn-date { font-size: 12px !important; }

    .txn-empty {
      text-align: center;
      padding: 80px 20px;
      span { font-size: 3rem; display: block; margin-bottom: 16px; }
      h3 { font-size: 1.3rem; color: white; margin-bottom: 8px; }
      p { color: var(--pf-text-muted); }
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
        this.loading.set(false);
        this.updateStats(res.transactions);
      },
      error: () => {
        this.transactions.set(this.getMockTransactions());
        this.total.set(5);
        this.loading.set(false);
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
      refunded: 'badge--cyan',
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
    this.stats[3].value = `$${revenue.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  }

  private getMockTransactions(): Transaction[] {
    return [
      { id:1, booking_id:1, transaction_ref:'TXN-ABC12345', amount:987.50, currency:'USD', payment_method:'card', card_last4:'4242', card_brand:'Visa', status:'success', created_at:new Date().toISOString(), booking:{ id:1, booking_ref:'BK12345678', user_name:'Sarah Mitchell', email:'sarah@example.com', room:{ hotel_name:'The Grand Azure', image_url:'', location:'Manhattan, New York' }, check_in:new Date().toISOString(), check_out:new Date().toISOString(), nights:3 } },
      { id:2, booking_id:2, transaction_ref:'TXN-DEF67890', amount:504.00, currency:'USD', payment_method:'card', card_last4:'5555', card_brand:'Mastercard', status:'success', created_at:new Date(Date.now()-86400000).toISOString(), booking:{ id:2, booking_ref:'BK87654321', user_name:'James Park', email:'james@example.com', room:{ hotel_name:'Serenity Beach Resort', image_url:'', location:'Bali, Indonesia' }, check_in:new Date().toISOString(), check_out:new Date().toISOString(), nights:2 } },
      { id:3, booking_id:3, transaction_ref:'TXN-GHI11223', amount:336.00, currency:'USD', payment_method:'card', card_last4:'0002', card_brand:'Visa', status:'failed', failure_reason:'Card declined', created_at:new Date(Date.now()-172800000).toISOString(), booking:{ id:3, booking_ref:'BK11223344', user_name:'Priya Sharma', email:'priya@example.com', room:{ hotel_name:'Alpine Summit Lodge', image_url:'', location:'Zermatt, Switzerland' }, check_in:new Date().toISOString(), check_out:new Date().toISOString(), nights:1 } },
      { id:4, booking_id:4, transaction_ref:'TXN-JKL44556', amount:620.00, currency:'USD', payment_method:'mock', status:'success', created_at:new Date(Date.now()-259200000).toISOString(), booking:{ id:4, booking_ref:'BK44556677', user_name:'Kenji Tanaka', email:'kenji@example.com', room:{ hotel_name:'Kyoto Garden Inn', image_url:'', location:'Gion District, Kyoto' }, check_in:new Date().toISOString(), check_out:new Date().toISOString(), nights:2 } },
    ];
  }
}
