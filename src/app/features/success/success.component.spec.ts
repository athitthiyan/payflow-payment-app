import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';

import { SuccessComponent } from './success.component';

describe('SuccessComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SuccessComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: {
                get: (key: string) =>
                  (
                    {
                      ref: 'TXN123',
                      amount: '450',
                      booking_ref: 'BK999',
                      booking_id: '7',
                    } as Record<string, string>
                  )[key] ?? null,
              },
            },
          },
        },
      ],
    }).compileComponents();
  });

  it('builds booking confirmation URL from query params', () => {
    const fixture = TestBed.createComponent(SuccessComponent);
    const component = fixture.componentInstance;

    component.ngOnInit();

    expect(component.transactionRef).toBe('TXN123');
    expect(component.amount).toBe(450);
    expect(component.bookingAppUrl).toContain('/booking-confirmation');
    expect(component.bookingAppUrl).toContain('ref=BK999');
    expect(component.bookingAppUrl).toContain('booking_id=7');
  });

  it('falls back to neutral values when query params are missing', async () => {
    TestBed.resetTestingModule();

    await TestBed.configureTestingModule({
      imports: [SuccessComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: {
                get: () => null,
              },
            },
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(SuccessComponent);
    const component = fixture.componentInstance;

    component.ngOnInit();

    expect(component.transactionRef).toBe('TXN-PENDING');
    expect(component.amount).toBe(0);
    expect(component.bookingAppUrl).toContain('/booking-confirmation');
    expect(component.bookingAppUrl).not.toContain('booking_id=');
  });
});
