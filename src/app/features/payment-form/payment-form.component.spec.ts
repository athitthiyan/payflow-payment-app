import { of, throwError } from 'rxjs';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';

import { PaymentFormComponent } from './payment-form.component';
import { PaymentService } from '../../core/services/payment.service';
import { environment } from '../../../environments/environment';

const mockMount = jest.fn();
const mockOn = jest.fn();
const mockDestroy = jest.fn();
const mockClear = jest.fn();
const mockConfirmCardPayment = jest.fn();
const mockCreate = jest.fn();
const mockElements = jest.fn(() => ({ create: mockCreate }));
const mockLoadStripe = jest.fn();

jest.mock('@stripe/stripe-js', () => ({
  loadStripe: (...args: unknown[]) => mockLoadStripe(...args),
}));

describe('PaymentFormComponent', () => {
  let paymentService: {
    confirmPayment: jest.Mock;
    recordFailure: jest.Mock;
    createPaymentIntent: jest.Mock;
    getPaymentStatus: jest.Mock;
    extendHold: jest.Mock;
  };
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    jest.useFakeTimers();
    mockMount.mockReset();
    mockOn.mockReset();
    mockDestroy.mockReset();
    mockClear.mockReset();
    mockConfirmCardPayment.mockReset();
    mockCreate.mockReset();
    mockElements.mockReset().mockReturnValue({ create: mockCreate });
    mockLoadStripe.mockReset();

    paymentService = {
      confirmPayment: jest.fn(),
      recordFailure: jest.fn(),
      createPaymentIntent: jest.fn(),
      getPaymentStatus: jest.fn(),
      extendHold: jest.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [PaymentFormComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PaymentService, useValue: paymentService },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: {
                get: (key: string) =>
                  ({ booking_id: '7', ref: 'BK123' } as Record<string, string>)[key] ?? null,
              },
            },
          },
        },
      ],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  function createComponent() {
    const fixture = TestBed.createComponent(PaymentFormComponent);
    const component = fixture.componentInstance;
    return { fixture, component };
  }

  function setupReadyComponent(component: PaymentFormComponent) {
    component.bookingAmount.set(300);
    component.bookingId.set(7);
    component.cardholderName = 'Athit';
    component.cardElementReady.set(true);
    (component as any).stripe = { confirmCardPayment: mockConfirmCardPayment };
    (component as any).cardElement = { clear: mockClear, destroy: mockDestroy };
  }

  // ─── Original tests (updated for new error messages / state machine) ─────────

  it('loads booking details from query params', () => {
    const { component } = createComponent();
    component.ngOnInit();

    const req = httpMock.expectOne(`${environment.apiUrl}/bookings/7`);
    req.flush({
      booking_ref: 'BK123',
      total_amount: 500,
      payment_status: 'pending',
      room: { hotel_name: 'Hotel', location: 'NYC' },
      check_in: '2026-04-10',
      check_out: '2026-04-12',
      nights: 2,
    });

    expect(component.bookingId()).toBe(7);
    expect(component.bookingRef()).toBe('BK123');
    expect(component.bookingAmount()).toBe(500);
  });

  it('handles booking load error', () => {
    const { component } = createComponent();
    component.ngOnInit();

    const req = httpMock.expectOne(`${environment.apiUrl}/bookings/7`);
    req.flush({}, { status: 500, statusText: 'Error' });

    expect(component.bookingLoadError()).toContain('Unable to load booking details');
    expect(component.bookingAmount()).toBe(0);
  });

  it('navigates to success when booking is already paid', () => {
    const { component } = createComponent();
    const router = TestBed.inject(Router);
    const navigateSpy = jest.spyOn(router, 'navigate').mockResolvedValue(true);

    component.ngOnInit();
    const req = httpMock.expectOne(`${environment.apiUrl}/bookings/7`);
    req.flush({
      booking_ref: 'BK123',
      total_amount: 500,
      payment_status: 'paid',
      room: {},
      check_in: '2026-04-10',
      check_out: '2026-04-12',
      nights: 2,
    });

    expect(navigateSpy).toHaveBeenCalled();
    expect(component.uiState()).toBe('success');
  });

  it('initializes stripe element and waits for ready event', async () => {
    const cardElement = {
      mount: mockMount,
      on: mockOn,
      destroy: mockDestroy,
    };
    mockCreate.mockReturnValue(cardElement);
    mockLoadStripe.mockResolvedValue({
      elements: mockElements,
      confirmCardPayment: mockConfirmCardPayment,
    });

    const { component } = createComponent();
    component.cardMountRef = { nativeElement: document.createElement('div') } as any;

    await (component as any).initStripe();

    expect(mockLoadStripe).toHaveBeenCalled();
    expect(mockMount).toHaveBeenCalled();
    expect(component.stripeReady()).toBe(true);

    const readyHandler = mockOn.mock.calls.find(call => call[0] === 'ready')?.[1];
    readyHandler();
    expect(component.cardElementReady()).toBe(true);
  });

  it('validates missing payment prerequisites before confirming card payment', async () => {
    const { component } = createComponent();

    await component.processCardPayment();
    expect(component.cardError()).toContain('Booking details loading');

    component.bookingAmount.set(100);
    await component.processCardPayment();
    expect(component.cardError()).toContain('Please enter the cardholder name');

    component.cardholderName = 'Athit';
    await component.processCardPayment();
    expect(component.cardError()).toContain('Payment system not ready');

    (component as any).stripe = {};
    (component as any).cardElement = { clear: mockClear, destroy: mockDestroy };
    await component.processCardPayment();
    expect(component.cardError()).toContain('Card form still initializing');
  });

  it('switches tabs and clears card errors', () => {
    const { component } = createComponent();
    component.cardError.set('boom');
    component.switchTab('card');
    expect(component.paymentMethod()).toBe('card');
    expect(component.cardError()).toBe('');
  });

  it('handles mock payment failure navigation', async () => {
    const { component } = createComponent();
    const router = TestBed.inject(Router);
    const navigateSpy = jest.spyOn(router, 'navigate').mockResolvedValue(true);

    component.bookingId.set(7);
    component.bookingAmount.set(100);
    paymentService.recordFailure.mockReturnValue(of({}));

    component.processMockPayment(false);

    expect(paymentService.recordFailure).not.toHaveBeenCalled();
    await jest.runAllTimersAsync();

    expect(paymentService.recordFailure).toHaveBeenCalledWith(7, 'Card declined (demo)');
    expect(navigateSpy).toHaveBeenCalledWith(['/failure'], {
      queryParams: { booking_id: 7, reason: 'Card declined (demo)' },
    });
  });

  it('verifies confirmed payment when backend returns 409 already-paid', async () => {
    const { component } = createComponent();

    component.bookingId.set(7);
    component.bookingAmount.set(100);
    component.cardholderName = 'Athit';
    component.cardElementReady.set(true);
    (component as any).stripe = {};
    (component as any).cardElement = { clear: mockClear, destroy: mockDestroy };

    paymentService.createPaymentIntent.mockReturnValue(
      throwError(() => ({ status: 409, error: { detail: 'Booking already paid' } }))
    );
    const verifySpy = jest.spyOn(component as any, 'verifyConfirmedPayment').mockResolvedValue(true);

    await component.processCardPayment();

    expect(verifySpy).toHaveBeenCalled();
    expect(component.processing()).toBe(false); // finally block ran
    expect(component.uiState()).toBe('success');
  });

  // ─── New state-machine tests ─────────────────────────────────────────────────

  it('transitions to failed_retry state on card decline', async () => {
    const { component } = createComponent();
    setupReadyComponent(component);

    paymentService.createPaymentIntent.mockReturnValue(
      of({ client_secret: 'cs_test_123' })
    );
    mockConfirmCardPayment.mockResolvedValue({ error: { message: 'Your card was declined.' } });
    paymentService.recordFailure.mockReturnValue(of({}));

    const p = component.processCardPayment();
    await jest.runAllTimersAsync();
    await p;

    expect(component.uiState()).toBe('failed_retry');
    expect(component.step()).toBe('details');
    expect(component.cardError()).toContain('Your card was declined');
  });

  it('always resets processing flag in finally block even on exception', async () => {
    const { component } = createComponent();
    setupReadyComponent(component);

    paymentService.createPaymentIntent.mockReturnValue(
      throwError(() => ({ status: 500, error: { detail: 'Server error' } }))
    );

    const p = component.processCardPayment();
    await jest.runAllTimersAsync();
    await p;

    // The most critical invariant: processing must always be false after any code path
    expect(component.processing()).toBe(false);
  });

  it('generates a new idempotency key after a failed payment attempt', async () => {
    const { component } = createComponent();
    setupReadyComponent(component);

    const firstKey = (component as any).idempotencyKey();

    paymentService.createPaymentIntent.mockReturnValue(of({ client_secret: 'cs_test' }));
    mockConfirmCardPayment.mockResolvedValue({ error: { message: 'Declined' } });
    paymentService.recordFailure.mockReturnValue(of({}));

    const p = component.processCardPayment();
    await jest.runAllTimersAsync();
    await p;

    const secondKey = (component as any).idempotencyKey();
    expect(secondKey).not.toBe(firstKey);
  });

  it('clears card element and cardholder name on retry', async () => {
    const { component } = createComponent();
    setupReadyComponent(component);
    component.cardholderName = 'Athit';

    paymentService.createPaymentIntent.mockReturnValue(of({ client_secret: 'cs_test' }));
    mockConfirmCardPayment.mockResolvedValue({ error: { message: 'Declined' } });
    paymentService.recordFailure.mockReturnValue(of({}));

    const p = component.processCardPayment();
    await jest.runAllTimersAsync();
    await p;

    expect(mockClear).toHaveBeenCalled();
    expect(component.cardholderName).toBe('');
  });

  it('transitions to conflict state on 409 unavailable response', async () => {
    const { component } = createComponent();
    setupReadyComponent(component);

    paymentService.createPaymentIntent.mockReturnValue(
      throwError(() => ({ status: 409, error: { detail: 'Dates are no longer available' } }))
    );

    const p = component.processCardPayment();
    await jest.runAllTimersAsync();
    await p;

    expect(component.uiState()).toBe('conflict');
    expect(component.processing()).toBe(false);
  });

  it('transitions to expired state when hold timer reaches zero', async () => {
    const { component } = createComponent();

    const futureExpiry = new Date(Date.now() + 2000).toISOString();
    (component as any).startHoldCountdown(futureExpiry);

    expect(component.uiState()).toBe('idle'); // not expired yet

    // Advance time past expiry
    jest.advanceTimersByTime(3000);

    expect(component.uiState()).toBe('expired');
    expect(component.holdExpired()).toBe(true);
    expect(component.holdSecondsLeft()).toBe(0);
  });

  it('prevents double-submit while processing is true', async () => {
    const { component } = createComponent();
    setupReadyComponent(component);

    // Manually set processing to true to simulate in-flight request
    component.processing.set(true);

    await component.processCardPayment();

    // No service calls should have been made
    expect(paymentService.createPaymentIntent).not.toHaveBeenCalled();
  });

  it('recovers to failed_retry state on page refresh when payment_status is failed', () => {
    const { component } = createComponent();
    component.ngOnInit();

    const futureExpiry = new Date(Date.now() + 600_000).toISOString();
    const req = httpMock.expectOne(`${environment.apiUrl}/bookings/7`);
    req.flush({
      booking_ref: 'BK123',
      total_amount: 300,
      payment_status: 'failed',
      hold_expires_at: futureExpiry,
      room: {},
      check_in: '2026-04-10',
      check_out: '2026-04-12',
      nights: 2,
    });

    expect(component.uiState()).toBe('failed_retry');
    expect(component.cardError()).toContain('previous payment failed');
    expect(component.holdSecondsLeft()).toBeGreaterThan(0);
  });

  it('shows hold countdown from booking hold_expires_at', () => {
    const { component } = createComponent();
    component.ngOnInit();

    const futureExpiry = new Date(Date.now() + 300_000).toISOString(); // 5 minutes
    const req = httpMock.expectOne(`${environment.apiUrl}/bookings/7`);
    req.flush({
      booking_ref: 'BK123',
      total_amount: 300,
      payment_status: 'pending',
      hold_expires_at: futureExpiry,
      room: {},
      check_in: '2026-04-10',
      check_out: '2026-04-12',
      nights: 2,
    });

    // Should have started countdown and seconds should be close to 300
    expect(component.holdSecondsLeft()).toBeGreaterThan(295);
    expect(component.holdSecondsLeft()).toBeLessThanOrEqual(300);
  });

  it('limits retries to maxRetries and shows limit message', async () => {
    const { component } = createComponent();
    setupReadyComponent(component);

    // Exhaust all retries
    component.retryCount.set(component.maxRetries);

    await component.processCardPayment();

    // Should block further retries and set appropriate error
    expect(paymentService.createPaymentIntent).not.toHaveBeenCalled();
    expect(component.cardError()).toContain('Maximum retry attempts');
  });

  it('mock payment success records transaction and navigates to success', async () => {
    const { component } = createComponent();
    const router = TestBed.inject(Router);
    const navigateSpy = jest.spyOn(router, 'navigate').mockResolvedValue(true);

    component.bookingId.set(7);
    component.bookingAmount.set(200);
    paymentService.confirmPayment.mockReturnValue(
      of({
        transaction_ref: 'TXN-MOCK001',
        amount: 200,
        booking: { booking_ref: 'BK123' },
      })
    );

    component.processMockPayment(true);
    await jest.runAllTimersAsync();

    expect(paymentService.confirmPayment).toHaveBeenCalledWith(
      expect.objectContaining({ booking_id: 7, payment_method: 'mock' })
    );
    expect(navigateSpy).toHaveBeenCalledWith(
      ['/success'],
      expect.objectContaining({ queryParams: expect.objectContaining({ ref: 'TXN-MOCK001' }) })
    );
  });

  it('card payment success records transaction and navigates', async () => {
    const { component } = createComponent();
    const router = TestBed.inject(Router);
    const navigateSpy = jest.spyOn(router, 'navigate').mockResolvedValue(true);
    setupReadyComponent(component);

    paymentService.createPaymentIntent.mockReturnValue(of({ client_secret: 'cs_test' }));
    mockConfirmCardPayment.mockResolvedValue({
      paymentIntent: { status: 'succeeded', id: 'pi_test_ABCDEF123456' },
    });
    paymentService.confirmPayment.mockReturnValue(
      of({
        transaction_ref: 'TXN-ABCDEF123456',
        amount: 300,
        booking: { booking_ref: 'BK123' },
      })
    );

    const p = component.processCardPayment();
    await jest.runAllTimersAsync();
    await p;

    expect(paymentService.confirmPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        booking_id: 7,
        payment_method: 'card',
        payment_intent_id: 'pi_test_ABCDEF123456',
      })
    );
    expect(navigateSpy).toHaveBeenCalled();
    expect(component.uiState()).toBe('success');
    expect(component.processing()).toBe(false);
  });

  it('timeout error transitions to failed_retry with timeout message', async () => {
    const { component } = createComponent();
    setupReadyComponent(component);

    // Simulate a TimeoutError from rxjs timeout operator
    paymentService.createPaymentIntent.mockReturnValue(
      throwError(() => ({ name: 'TimeoutError' }))
    );

    const p = component.processCardPayment();
    await jest.runAllTimersAsync();
    await p;

    expect(component.uiState()).toBe('failed_retry');
    expect(component.cardError()).toContain('timed out');
    expect(component.processing()).toBe(false);
  });
});
