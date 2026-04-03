import { of, throwError } from 'rxjs';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { TransactionHistoryComponent } from './transaction-history.component';
import { PaymentService } from '../../core/services/payment.service';

describe('TransactionHistoryComponent', () => {
  let paymentService: { getTransactions: jest.Mock };

  beforeEach(async () => {
    paymentService = { getTransactions: jest.fn() };

    await TestBed.configureTestingModule({
      imports: [TransactionHistoryComponent],
      providers: [
        provideRouter([]),
        { provide: PaymentService, useValue: paymentService },
      ],
    }).compileComponents();
  });

  it('loads transactions and updates stats', () => {
    paymentService.getTransactions.mockReturnValue(
      of({
        total: 2,
        transactions: [
          { id: 1, amount: 200, status: 'success' },
          { id: 2, amount: 50, status: 'failed' },
        ],
      })
    );

    const fixture = TestBed.createComponent(TransactionHistoryComponent);
    const component = fixture.componentInstance;
    component.ngOnInit();

    expect(component.transactions().length).toBe(2);
    expect(component.total()).toBe(2);
    expect(component.loading()).toBe(false);
    expect(component.stats[1].value).toBe('1');
    expect(component.stats[2].value).toBe('1');
  });

  it('handles load error and load more', () => {
    paymentService.getTransactions
      .mockReturnValueOnce(throwError(() => new Error('boom')))
      .mockReturnValueOnce(of({ total: 1, transactions: [{ id: 3, amount: 100, status: 'success' }] }));

    const fixture = TestBed.createComponent(TransactionHistoryComponent);
    const component = fixture.componentInstance;
    component.ngOnInit();

    expect(component.loadError()).toBe(true);
    expect(component.transactions()).toEqual([]);

    component.loadMore();
    expect(component.transactions().length).toBe(1);
    expect(component.getBadgeClass('success')).toBe('badge--success');
    expect(component.getBadgeClass('unknown')).toBe('');
  });
});
