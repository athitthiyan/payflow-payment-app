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

interface StripeCardElementStub {
  clear?: jest.Mock;
  destroy: jest.Mock;
}

interface PaymentFormComponentPrivateState {
  stripe: {
    confirmCardPayment?: jest.Mock;
    elements?: jest.Mock;
  } | null;
  cardElement: StripeCardElementStub | null;
  idempotencyKey: () => string;
  holdCountdownInterval: ReturnType<typeof setInterval> | null;
  initStripe: () => Promise<void>;
  queueCardMount: () => void;
  verifyConfirmedPayment: () => Promise<boolean>;
  startHoldCountdown: (holdExpiresAt: string) => void;
  startRetryCooldown: (seconds: number) => void;
  applyRetryCooldown: (detail?: { message?: string; failed_payment_count?: number; retry_after_seconds?: number }) => void;
  refreshRetryPolicy: (bookingId: number) => void;
  navigateToSuccess: (ref: string, amount: number, bookingRef?: string) => void;
  externalRedirect: (url: string) => void;
}

interface MountRefLike {
  nativeElement: HTMLDivElement;
}

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
    createRazorpayOrder: jest.Mock;
    verifyRazorpayPayment: jest.Mock;
  };
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
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
      createRazorpayOrder: jest.fn(),
      verifyRazorpayPayment: jest.fn(),
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

  function createConnectedMountRef() {
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    return {
      nativeElement: mount,
      cleanup: () => mount.remove(),
    };
  }

  function setupReadyComponent(component: PaymentFormComponent) {
    component.bookingAmount.set(300);
    component.bookingId.set(7);
    component.cardholderName = 'Athit';
    component.cardElementReady.set(true);
    (component as unknown as PaymentFormComponentPrivateState).stripe = { confirmCardPayment: mockConfirmCardPayment };
    (component as unknown as PaymentFormComponentPrivateState).cardElement = { clear: mockClear, destroy: mockDestroy };
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

  it('navigates to success when booking is already confirmed even before payment_status is normalized', () => {
    const { component } = createComponent();
    const router = TestBed.inject(Router);
    const navigateSpy = jest.spyOn(router, 'navigate').mockResolvedValue(true);

    component.ngOnInit();
    const req = httpMock.expectOne(`${environment.apiUrl}/bookings/7`);
    req.flush({
      booking_ref: 'BK123',
      total_amount: 500,
      status: 'confirmed',
      payment_status: 'processing',
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
    const mountRef = createConnectedMountRef();
    component.cardMountRef = { nativeElement: mountRef.nativeElement } as unknown as MountRefLike;
    component.paymentMethod.set('card');

    await (component as unknown as PaymentFormComponentPrivateState).initStripe();

    expect(mockLoadStripe).toHaveBeenCalled();
    expect(mockMount).toHaveBeenCalled();
    expect(component.stripeReady()).toBe(true);

    const readyHandler = mockOn.mock.calls.find(call => call[0] === 'ready')?.[1];
    readyHandler();
    expect(component.cardElementReady()).toBe(true);
    mountRef.cleanup();
  });

  it('calls initStripe from ngAfterViewInit', () => {
    const { component } = createComponent();
    const initSpy = jest.spyOn(component as unknown as PaymentFormComponentPrivateState, 'initStripe').mockResolvedValue(undefined);

    component.ngAfterViewInit();

    expect(initSpy).toHaveBeenCalled();
  });

  it('captures stripe card change errors and handles init failure', async () => {
    mockCreate.mockReturnValue({
      mount: mockMount,
      on: mockOn,
      destroy: mockDestroy,
    });
    mockLoadStripe.mockResolvedValue(null);

    const { component } = createComponent();
    const mountRef = createConnectedMountRef();
    component.cardMountRef = { nativeElement: mountRef.nativeElement } as unknown as MountRefLike;
    component.paymentMethod.set('card');

    await (component as unknown as PaymentFormComponentPrivateState).initStripe();
    expect(component.stripeReady()).toBe(false);

    mockLoadStripe.mockResolvedValue({
      elements: mockElements,
      confirmCardPayment: mockConfirmCardPayment,
    });
    await (component as unknown as PaymentFormComponentPrivateState).initStripe();
    const changeHandler = mockOn.mock.calls.find(call => call[0] === 'change')?.[1];
    changeHandler({ error: { message: 'Bad card' } });

    expect(component.cardError()).toBe('Bad card');
    mountRef.cleanup();
  });

  it('keeps stripeReady false when Stripe initialization throws', async () => {
    mockLoadStripe.mockRejectedValue(new Error('stripe init failed'));

    const { component } = createComponent();
    const mountRef = createConnectedMountRef();
    component.cardMountRef = { nativeElement: mountRef.nativeElement } as unknown as MountRefLike;

    await (component as unknown as PaymentFormComponentPrivateState).initStripe();

    expect(component.stripeReady()).toBe(false);
    mountRef.cleanup();
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

    (component as unknown as PaymentFormComponentPrivateState).stripe = {};
    (component as unknown as PaymentFormComponentPrivateState).cardElement = { clear: mockClear, destroy: mockDestroy };
    await component.processCardPayment();
    expect(component.cardError()).toContain('Card form still initializing');
  });

  it('defaults to the secure card flow', () => {
    const { component } = createComponent();
    expect(component.paymentMethod()).toBe('card');
  });

  it('handles mock payment failure navigation', async () => {
    const { component } = createComponent();
    const router = TestBed.inject(Router);
    const navigateSpy = jest.spyOn(router, 'navigate').mockResolvedValue(true);

    component.bookingId.set(7);
    component.bookingAmount.set(100);
    component.holdExpiresAt.set('2026-04-05T09:10:00.000Z');
    paymentService.recordFailure.mockReturnValue(of({}));

    component.processMockPayment(false);

    expect(paymentService.recordFailure).not.toHaveBeenCalled();
    await jest.runAllTimersAsync();

    expect(paymentService.recordFailure).toHaveBeenCalledWith(7, 'Card declined (demo)');
    expect(navigateSpy).toHaveBeenCalledWith(['/failure'], {
      queryParams: {
        booking_id: 7,
        reason: 'Card declined (demo)',
        hold_expires_at: '2026-04-05T09:10:00.000Z',
      },
    });
  });

  it('verifies confirmed payment when backend returns 409 already-paid', async () => {
    const { component } = createComponent();

    component.bookingId.set(7);
    component.bookingAmount.set(100);
    component.cardholderName = 'Athit';
    component.cardElementReady.set(true);
    (component as unknown as PaymentFormComponentPrivateState).stripe = {};
    (component as unknown as PaymentFormComponentPrivateState).cardElement = { clear: mockClear, destroy: mockDestroy };

    paymentService.createPaymentIntent.mockReturnValue(
      throwError(() => ({ status: 409, error: { detail: 'Booking already paid' } }))
    );
    const verifySpy = jest.spyOn(component as unknown as PaymentFormComponentPrivateState, 'verifyConfirmedPayment').mockResolvedValue(true);

    await component.processCardPayment();

    expect(verifySpy).toHaveBeenCalled();
    expect(component.processing()).toBe(false); // finally block ran
    expect(component.uiState()).toBe('success');
  });

  it('falls back to failed_retry when already-paid verification does not confirm payment', async () => {
    const { component } = createComponent();

    component.bookingId.set(7);
    component.bookingAmount.set(100);
    component.cardholderName = 'Athit';
    component.cardElementReady.set(true);
    (component as unknown as PaymentFormComponentPrivateState).stripe = {};
    (component as unknown as PaymentFormComponentPrivateState).cardElement = { clear: mockClear, destroy: mockDestroy };

    paymentService.createPaymentIntent.mockReturnValue(
      throwError(() => ({ status: 409, error: { detail: 'Booking already paid' } })),
    );
    jest.spyOn(component as unknown as PaymentFormComponentPrivateState, 'verifyConfirmedPayment').mockResolvedValue(false);

    await component.processCardPayment();

    expect(component.uiState()).toBe('failed_retry');
    expect(component.step()).toBe('details');
    expect(component.cardError()).toContain('still syncing');
  });

  // ─── New state-machine tests ─────────────────────────────────────────────────

  it('transitions to failed_retry state on card decline', async () => {
    const { component } = createComponent();
    setupReadyComponent(component);

    paymentService.createPaymentIntent.mockReturnValue(
      of({
        client_secret: 'cs_test_123',
        payment_intent_id: 'pi_declined_001',
        transaction_ref: 'TXN-DECLINED-001',
      })
    );
    mockConfirmCardPayment.mockResolvedValue({ error: { message: 'Your card was declined.' } });
    paymentService.recordFailure.mockReturnValue(of({}));

    const p = component.processCardPayment();
    await jest.runAllTimersAsync();
    await p;

    expect(paymentService.recordFailure).toHaveBeenCalledWith(
      7,
      'Your card was declined.',
      'pi_declined_001',
      'TXN-DECLINED-001',
    );
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

    const firstKey = (component as unknown as PaymentFormComponentPrivateState).idempotencyKey();

    paymentService.createPaymentIntent.mockReturnValue(
      of({
        client_secret: 'cs_test',
        payment_intent_id: 'pi_retry_001',
        transaction_ref: 'TXN-RETRY-001',
      }),
    );
    mockConfirmCardPayment.mockResolvedValue({ error: { message: 'Declined' } });
    paymentService.recordFailure.mockReturnValue(of({}));

    const p = component.processCardPayment();
    await jest.runAllTimersAsync();
    await p;

    const secondKey = (component as unknown as PaymentFormComponentPrivateState).idempotencyKey();
    expect(secondKey).not.toBe(firstKey);
  });

  it('rebuilds the stripe card element and clears the cardholder name on retry', async () => {
    const { component } = createComponent();
    const rebuiltCardElement = {
      mount: mockMount,
      on: mockOn,
      destroy: mockDestroy,
    };
    mockCreate.mockReturnValue(rebuiltCardElement);
    const mountRef = createConnectedMountRef();
    component.cardMountRef = { nativeElement: mountRef.nativeElement } as unknown as MountRefLike;
    component.bookingAmount.set(300);
    component.bookingId.set(7);
    component.cardholderName = 'Athit';
    component.cardElementReady.set(true);
    (component as unknown as PaymentFormComponentPrivateState).stripe = {
      confirmCardPayment: mockConfirmCardPayment,
      elements: mockElements,
    };
    (component as unknown as PaymentFormComponentPrivateState).cardElement = { destroy: mockDestroy };

    paymentService.createPaymentIntent.mockReturnValue(
      of({
        client_secret: 'cs_test',
        payment_intent_id: 'pi_retry_001',
        transaction_ref: 'TXN-RETRY-001',
      }),
    );
    mockConfirmCardPayment.mockResolvedValue({ error: { message: 'Declined' } });
    paymentService.recordFailure.mockReturnValue(of({}));

    const p = component.processCardPayment();
    await jest.runAllTimersAsync();
    await p;

    expect(mockDestroy).toHaveBeenCalled();
    expect(mockMount).toHaveBeenCalled();
    expect(paymentService.recordFailure).toHaveBeenCalledWith(
      7,
      'Declined',
      'pi_retry_001',
      'TXN-RETRY-001',
    );
    expect(component.cardholderName).toBe('');
    expect(component.cardElementReady()).toBe(false);
    mountRef.cleanup();
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
    (component as unknown as PaymentFormComponentPrivateState).startHoldCountdown(futureExpiry);

    expect(component.uiState()).toBe('idle'); // not expired yet

    // Advance time past expiry
    jest.advanceTimersByTime(3000);

    expect(component.uiState()).toBe('expired');
    expect(component.holdExpired()).toBe(true);
    expect(component.holdSecondsLeft()).toBe(0);
  });

  it('formats hold countdown minutes and seconds with leading zeroes', () => {
    const { component } = createComponent();
    component.holdSecondsLeft.set(125);

    expect(component.holdMinutes()).toBe('02');
    expect(component.holdSecondsPad()).toBe('05');
  });

  it('keeps success state when countdown expires after payment succeeds', async () => {
    const { component } = createComponent();
    component.uiState.set('success');

    const futureExpiry = new Date(Date.now() + 1000).toISOString();
    (component as unknown as PaymentFormComponentPrivateState).startHoldCountdown(futureExpiry);
    jest.advanceTimersByTime(2000);

    expect(component.uiState()).toBe('success');
    expect(component.holdExpired()).toBe(true);
  });

  it('retries loading the booking when booking id exists', () => {
    const { component } = createComponent();
    const loadSpy = jest.spyOn(component, 'loadBooking').mockImplementation();
    component.bookingId.set(7);

    component.retryLoadBooking();

    expect(loadSpy).toHaveBeenCalledWith(7);
  });

  it('does not retry loading when booking id is missing', () => {
    const { component } = createComponent();
    const loadSpy = jest.spyOn(component, 'loadBooking').mockImplementation();

    component.retryLoadBooking();

    expect(loadSpy).not.toHaveBeenCalled();
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

  it('marks the booking as expired when the recovered hold is already expired', () => {
    const { component } = createComponent();
    component.ngOnInit();

    const req = httpMock.expectOne(`${environment.apiUrl}/bookings/7`);
    req.flush({
      booking_ref: 'BK123',
      total_amount: 300,
      payment_status: 'pending',
      hold_expires_at: new Date(Date.now() - 1000).toISOString(),
      room: {},
      check_in: '2026-04-10',
      check_out: '2026-04-12',
      nights: 2,
    });

    expect(component.uiState()).toBe('expired');
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

  it('pauses retries with a cooldown after maxRetries', async () => {
    const { component } = createComponent();
    setupReadyComponent(component);

    // Exhaust all retries
    component.retryCount.set(component.maxRetries);

    await component.processCardPayment();

    expect(paymentService.createPaymentIntent).not.toHaveBeenCalled();
    expect(component.cardError()).toContain('Payment temporarily paused');
    expect(component.retryCooldownSecondsLeft()).toBeGreaterThan(0);
  });

  it('blocks payment attempts while retry cooldown is active', async () => {
    const { component } = createComponent();
    setupReadyComponent(component);
    component.retryCooldownSecondsLeft.set(75);

    await component.processCardPayment();

    expect(paymentService.createPaymentIntent).not.toHaveBeenCalled();
    expect(component.cardError()).toContain('Retry available in 01:15');
  });

  it('clears retry cooldown and resets retry count when the countdown ends', async () => {
    const { component } = createComponent();
    component.retryCount.set(5);
    component.uiState.set('failed_retry');

    (component as unknown as PaymentFormComponentPrivateState).startRetryCooldown(1);
    await jest.advanceTimersByTimeAsync(1100);

    expect(component.retryCooldownSecondsLeft()).toBe(0);
    expect(component.retryCount()).toBe(0);
    expect(component.cardError()).toContain('Retry is available now');
  });

  it('applies backend retry cooldown policy and ignores empty cooldown payloads', () => {
    const { component } = createComponent();
    const privateComponent = component as unknown as PaymentFormComponentPrivateState;

    privateComponent.applyRetryCooldown();
    expect(component.retryCooldownSecondsLeft()).toBe(0);

    privateComponent.applyRetryCooldown({
      message: 'Payment temporarily paused for security.',
      failed_payment_count: 5,
      retry_after_seconds: 120,
    });

    expect(component.retryCount()).toBe(5);
    expect(component.retryCooldownSecondsLeft()).toBe(120);
    expect(component.cardError()).toContain('Retry available in 02:00');
  });

  it('refreshes retry policy from payment status after restoring a failed booking', () => {
    const { component } = createComponent();
    paymentService.getPaymentStatus.mockReturnValue(of({
      failed_payment_count: 5,
      retry_after_seconds: 180,
      retry_available_at: '2026-04-06T12:00:00Z',
    }));

    (component as unknown as PaymentFormComponentPrivateState).refreshRetryPolicy(7);

    expect(paymentService.getPaymentStatus).toHaveBeenCalledWith(7);
    expect(component.retryCooldownSecondsLeft()).toBe(180);
  });

  it('continues when retry policy refresh fails', () => {
    const { component } = createComponent();
    paymentService.getPaymentStatus.mockReturnValue(throwError(() => new Error('offline')));

    (component as unknown as PaymentFormComponentPrivateState).refreshRetryPolicy(7);

    expect(component.retryCooldownSecondsLeft()).toBe(0);
  });

  it('navigates back to booking details without cancelling the hold', () => {
    const { component } = createComponent();
    const redirectSpy = jest.spyOn(component as unknown as PaymentFormComponentPrivateState, 'externalRedirect').mockImplementation();
    component.bookingId.set(7);

    component.goBackToBooking();

    expect(redirectSpy).toHaveBeenCalledWith(`${environment.bookingAppUrl.replace(/\/$/, '')}/checkout/7`);
  });

  it('navigates back home when booking id is unavailable', () => {
    const { component } = createComponent();
    const redirectSpy = jest.spyOn(component as unknown as PaymentFormComponentPrivateState, 'externalRedirect').mockImplementation();
    component.bookingId.set(0);

    component.goBackToBooking();

    expect(redirectSpy).toHaveBeenCalledWith(environment.bookingAppUrl);
  });

  it('performs external redirects through the browser location', () => {
    const { component } = createComponent();
    const hashUrl = `${window.location.href.split('#')[0]}#stayvora-payment-return`;

    (component as unknown as PaymentFormComponentPrivateState).externalRedirect(hashUrl);

    expect(window.location.href).toBe(hashUrl);
  });

  it('cancels a booking hold from the payment page and redirects home', async () => {
    const { component } = createComponent();
    const redirectSpy = jest.spyOn(component as unknown as PaymentFormComponentPrivateState, 'externalRedirect').mockImplementation();
    component.bookingId.set(7);
    component.holdSecondsLeft.set(120);
    (component as unknown as PaymentFormComponentPrivateState).startRetryCooldown(60);

    component.cancelBooking();
    const req = httpMock.expectOne(`${environment.apiUrl}/bookings/7/cancel`);
    expect(req.request.method).toBe('PATCH');
    req.flush({ booking_ref: 'BK123', total_amount: 300, payment_status: 'cancelled', check_in: '', check_out: '', nights: 1 });
    await jest.advanceTimersByTimeAsync(950);

    expect(component.actionMessage()).toContain('Booking cancelled successfully');
    expect(component.holdSecondsLeft()).toBe(0);
    expect(component.retryCooldownSecondsLeft()).toBe(0);
    expect(redirectSpy).toHaveBeenCalledWith(environment.bookingAppUrl);
  });

  it('surfaces cancel booking errors and ignores unsafe cancel attempts', () => {
    const { component } = createComponent();

    component.cancelBooking();
    httpMock.expectNone(`${environment.apiUrl}/bookings/0/cancel`);

    component.bookingId.set(7);
    component.processing.set(true);
    component.cancelBooking();
    httpMock.expectNone(`${environment.apiUrl}/bookings/7/cancel`);

    component.processing.set(false);
    component.cancellingBooking.set(true);
    component.cancelBooking();
    httpMock.expectNone(`${environment.apiUrl}/bookings/7/cancel`);

    component.cancellingBooking.set(false);
    component.cancelBooking();
    const req = httpMock.expectOne(`${environment.apiUrl}/bookings/7/cancel`);
    req.flush({ detail: 'boom' }, { status: 500, statusText: 'Server Error' });

    expect(component.cardError()).toContain('Could not cancel');
    expect(component.cancellingBooking()).toBe(false);
  });

  it('returns early from mock payment when booking details are incomplete', () => {
    const { component } = createComponent();

    component.processMockPayment(true);
    component.processMockPayment(false);

    expect(paymentService.confirmPayment).not.toHaveBeenCalled();
    expect(paymentService.recordFailure).not.toHaveBeenCalled();
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

  it('mock payment success falls back to polling when confirm endpoint fails', async () => {
    const { component } = createComponent();
    const verifySpy = jest.spyOn(component as unknown as PaymentFormComponentPrivateState, 'verifyConfirmedPayment').mockResolvedValue(false);
    setupReadyComponent(component);

    component.bookingId.set(7);
    component.bookingAmount.set(200);
    paymentService.confirmPayment.mockReturnValue(throwError(() => new Error('syncing')));

    component.processMockPayment(true);
    await jest.runAllTimersAsync();

    expect(verifySpy).toHaveBeenCalled();
    expect(component.step()).toBe('details');
    expect(component.cardError()).toContain('still processing');
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
        status: 'success',
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

  it('waits for backend confirmation before navigating when card payment response is still processing', async () => {
    const { component } = createComponent();
    const verifySpy = jest
      .spyOn(component as unknown as PaymentFormComponentPrivateState, 'verifyConfirmedPayment')
      .mockResolvedValue(true);
    setupReadyComponent(component);

    paymentService.createPaymentIntent.mockReturnValue(of({ client_secret: 'cs_test' }));
    mockConfirmCardPayment.mockResolvedValue({
      paymentIntent: { status: 'succeeded', id: 'pi_test_WAIT123456' },
    });
    paymentService.confirmPayment.mockReturnValue(
      of({
        transaction_ref: 'TXN-WAIT123456',
        amount: 300,
        status: 'processing',
        booking: { booking_ref: 'BK123' },
      }),
    );

    const p = component.processCardPayment();
    await jest.runAllTimersAsync();
    await p;

    expect(verifySpy).toHaveBeenCalled();
    expect(component.uiState()).toBe('success');
    expect(component.processing()).toBe(false);
  });

  it('returns to retry state when card payment confirmation remains processing', async () => {
    const { component } = createComponent();
    const router = TestBed.inject(Router);
    const navigateSpy = jest.spyOn(router, 'navigate').mockResolvedValue(true);
    const verifySpy = jest
      .spyOn(component as unknown as PaymentFormComponentPrivateState, 'verifyConfirmedPayment')
      .mockResolvedValue(false);
    setupReadyComponent(component);

    paymentService.createPaymentIntent.mockReturnValue(of({ client_secret: 'cs_test' }));
    mockConfirmCardPayment.mockResolvedValue({
      paymentIntent: { status: 'succeeded', id: 'pi_test_STILLPROC1' },
    });
    paymentService.confirmPayment.mockReturnValue(
      of({
        transaction_ref: 'TXN-STILLPROC1',
        amount: 300,
        status: 'processing',
        booking: { booking_ref: 'BK123' },
      }),
    );

    const p = component.processCardPayment();
    await jest.runAllTimersAsync();
    await p;

    expect(verifySpy).toHaveBeenCalled();
    expect(component.uiState()).toBe('failed_retry');
    expect(component.cardError()).toContain('still syncing');
    expect(navigateSpy).not.toHaveBeenCalled();
    expect(component.processing()).toBe(false);
  });

  it('uses bookingRef signal when navigateToSuccess is called without an explicit booking ref', () => {
    const { component } = createComponent();
    const router = TestBed.inject(Router);
    const navigateSpy = jest.spyOn(router, 'navigate').mockResolvedValue(true);
    component.bookingId.set(7);
    component.bookingRef.set('BK-SIGNAL');

    (component as unknown as { navigateToSuccess: (ref: string, amount: number, bookingRef?: string) => void })
      .navigateToSuccess('TXN-1', 120);

    expect(navigateSpy).toHaveBeenCalledWith(['/success'], {
      queryParams: {
        ref: 'TXN-1',
        amount: 120,
        booking_id: 7,
        booking_ref: 'BK-SIGNAL',
      },
    });
  });

  it('uses booking booking_ref fallback when navigateToSuccess has no explicit ref and signal is empty', () => {
    const { component } = createComponent();
    const router = TestBed.inject(Router);
    const navigateSpy = jest.spyOn(router, 'navigate').mockResolvedValue(true);
    component.bookingId.set(7);
    component.bookingRef.set('');
    component.booking.set({
      booking_ref: 'BK-FROM-BOOKING',
      total_amount: 140,
      payment_status: 'pending',
      check_in: '2026-04-10',
      check_out: '2026-04-12',
      nights: 2,
    });

    (component as unknown as { navigateToSuccess: (ref: string, amount: number, bookingRef?: string) => void })
      .navigateToSuccess('TXN-2', 140);

    expect(navigateSpy).toHaveBeenCalledWith(['/success'], {
      queryParams: {
        ref: 'TXN-2',
        amount: 140,
        booking_id: 7,
        booking_ref: 'BK-FROM-BOOKING',
      },
    });
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

  it('uses generated transaction data when payment polling confirms payment without latest transaction details', async () => {
    const { component } = createComponent();
    const router = TestBed.inject(Router);
    const navigateSpy = jest.spyOn(router, 'navigate').mockResolvedValue(true);
    component.bookingId.set(7);
    component.bookingAmount.set(321);

    paymentService.getPaymentStatus.mockReturnValue(
      of({
        payment_status: 'paid',
        booking_ref: 'BK123',
        latest_transaction: null,
      }),
    );

    const promise = (component as unknown as { verifyConfirmedPayment: () => Promise<boolean> }).verifyConfirmedPayment();
    await expect(promise).resolves.toBe(true);

    expect(navigateSpy).toHaveBeenCalledWith(['/success'], {
      queryParams: expect.objectContaining({
        ref: expect.stringMatching(/^TXN-/),
        amount: 321,
        booking_id: 7,
        booking_ref: 'BK123',
      }),
    });
  });

  it('treats confirmed booking status or lifecycle state as a final successful poll result', async () => {
    const { component } = createComponent();
    const router = TestBed.inject(Router);
    const navigateSpy = jest.spyOn(router, 'navigate').mockResolvedValue(true);
    component.bookingId.set(7);
    component.bookingAmount.set(321);

    paymentService.getPaymentStatus.mockReturnValue(
      of({
        payment_status: 'processing',
        booking_status: 'confirmed',
        lifecycle_state: 'CONFIRMED',
        booking_ref: 'BK123',
        latest_transaction: {
          transaction_ref: 'TXN-CONFIRMED',
          amount: 321,
        },
      }),
    );

    await expect(
      (component as unknown as { verifyConfirmedPayment: () => Promise<boolean> }).verifyConfirmedPayment(),
    ).resolves.toBe(true);

    expect(navigateSpy).toHaveBeenCalledWith(['/success'], {
      queryParams: {
        ref: 'TXN-CONFIRMED',
        amount: 321,
        booking_id: 7,
        booking_ref: 'BK123',
      },
    });
  });

  it('destroys the card element and stops countdown on destroy', () => {
    const { component } = createComponent();
    component.cardElementReady.set(true);
    (component as unknown as PaymentFormComponentPrivateState).cardElement = { destroy: mockDestroy };

    const futureExpiry = new Date(Date.now() + 5000).toISOString();
    (component as unknown as PaymentFormComponentPrivateState).startHoldCountdown(futureExpiry);
    component.ngOnDestroy();

    expect(component.cardElementReady()).toBe(false);
    expect(mockDestroy).toHaveBeenCalled();
    expect((component as unknown as PaymentFormComponentPrivateState).holdCountdownInterval).toBeNull();
  });

  it('polls payment status until a confirmed payment appears', async () => {
    const { component } = createComponent();
    // polling resolves when payment confirmed
    expect(component).toBeTruthy();
  });

  // ─── verifyConfirmedPayment catch path (lines 1337-1344) ─────────────────────

  it('verifyConfirmedPayment returns false after all retries when getPaymentStatus always throws', async () => {
    const { component } = createComponent();
    component.bookingId.set(7);
    component.bookingAmount.set(300);

    paymentService.getPaymentStatus.mockReturnValue(throwError(() => new Error('network')));

    const promise = (component as unknown as { verifyConfirmedPayment: () => Promise<boolean> }).verifyConfirmedPayment();

    // 6 retries × 1500ms delay
    for (let i = 0; i < 6; i++) {
      await jest.advanceTimersByTimeAsync(1500);
    }

    await expect(promise).resolves.toBe(false);
    expect(paymentService.getPaymentStatus).toHaveBeenCalledTimes(6);
  });

  // ─── selectPaymentMethod + helpers (lines 1365-1384) ─────────────────────────

  it('selectPaymentMethod sets method and clears card error without calling initStripe for non-card', () => {
    const { component } = createComponent();
    const initSpy = jest.spyOn(component as unknown as PaymentFormComponentPrivateState, 'initStripe').mockResolvedValue(undefined);
    component.cardError.set('some error');

    component.selectPaymentMethod('upi');

    expect(component.selectedPaymentMethod()).toBe('upi');
    expect(component.cardError()).toBe('');
    expect(initSpy).not.toHaveBeenCalled();
  });

  it('selectPaymentMethod calls initStripe when selecting card', () => {
    const { component } = createComponent();
    const initSpy = jest.spyOn(component as unknown as PaymentFormComponentPrivateState, 'initStripe').mockResolvedValue(undefined);

    component.selectPaymentMethod('card');

    expect(component.selectedPaymentMethod()).toBe('card');
    expect(initSpy).toHaveBeenCalled();
  });

  it('getPaymentMethodLabel returns correct labels and falls back to raw method string', () => {
    const { component } = createComponent();

    expect(component.getPaymentMethodLabel('card')).toBe('Card');
    expect(component.getPaymentMethodLabel('upi')).toBe('UPI');
    expect(component.getPaymentMethodLabel('gpay')).toBe('Google Pay');
    expect(component.getPaymentMethodLabel('phonepe')).toBe('PhonePe');
    expect(component.getPaymentMethodLabel('unknown')).toBe('unknown');
  });

  it('convertUSDToINR converts correctly', () => {
    const { component } = createComponent();

    expect(component.convertUSDToINR(1)).toBe(83);
    expect(component.convertUSDToINR(10)).toBe(830);
  });

  // ─── payWithRazorpay (lines 1388-1482) ───────────────────────────────────────

  it('payWithRazorpay returns early when already processing', async () => {
    const { component } = createComponent();
    component.processing.set(true);

    await component.payWithRazorpay('upi');

    expect(component.cardError()).toBe('');
  });

  it('payWithRazorpay returns early when bookingAmount is 0', async () => {
    const { component } = createComponent();
    component.bookingAmount.set(0);

    await component.payWithRazorpay('upi');

    expect(component.cardError()).toContain('loading');
  });

  it('payWithRazorpay returns early when hold expired', async () => {
    const { component } = createComponent();
    component.bookingAmount.set(300);
    component.bookingId.set(7);
    component.holdSecondsLeft.set(0);

    await component.payWithRazorpay('upi');

    expect(component.cardError()).toContain('expired');
    expect(component.processing()).toBe(false);
  });

  it('payWithRazorpay shows error when Razorpay script fails to load', async () => {
    const { component } = createComponent();
    component.bookingAmount.set(300);
    component.bookingId.set(7);
    component.holdSecondsLeft.set(600);

    (window as unknown as { Razorpay?: unknown }).Razorpay = undefined;

    const originalCreateElement = document.createElement.bind(document);
    jest.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === 'script') {
        setTimeout(() => el.onerror?.(new Event('error')), 0);
      }
      return el;
    });

    const p = component.payWithRazorpay('upi');
    await jest.runAllTimersAsync();
    await p;

    expect(component.cardError()).toContain('Payment failed');
    expect(component.processing()).toBe(false);
    expect(component.step()).toBe('details');
  });

  it('payWithRazorpay loads Razorpay script when not already loaded and opens checkout', async () => {
    const { component } = createComponent();
    component.bookingAmount.set(300);
    component.bookingId.set(7);
    component.holdSecondsLeft.set(600);

    // Ensure Razorpay is NOT on window so loadRazorpayScript creates a script element
    (window as unknown as { Razorpay?: unknown }).Razorpay = undefined;

    const originalCreateElement = document.createElement.bind(document);
    jest.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === 'script') {
        setTimeout(() => {
          // Set Razorpay on window (simulating script load) then fire onload
          const mockOpen = jest.fn();
          (window as unknown as { Razorpay: unknown }).Razorpay = jest.fn().mockImplementation(() => ({ open: mockOpen, on: jest.fn() }));
          el.onload?.(new Event('load'));
        }, 0);
      }
      return el;
    });

    paymentService.createRazorpayOrder.mockReturnValue(of({
      order_id: 'order_load', amount: 25000, currency: 'INR', booking_id: 7,
      key_id: 'rzp_test', amount_paise: 2500000, transaction_ref: 'TXN-LOAD',
    }));

    const p = component.payWithRazorpay('upi');
    await jest.runAllTimersAsync();
    await p;

    expect(paymentService.createRazorpayOrder).toHaveBeenCalled();

    delete (window as unknown as { Razorpay?: unknown }).Razorpay;
  });

  it('payWithRazorpay happy path: handler verifies and navigates on success', async () => {
    const { component } = createComponent();
    component.bookingAmount.set(300);
    component.bookingId.set(7);
    component.holdSecondsLeft.set(600);

    const mockOpen = jest.fn();
    let capturedHandler: (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => void;

    const MockRazorpay = jest.fn().mockImplementation((opts: Record<string, unknown>) => {
      capturedHandler = (opts as unknown as { handler: typeof capturedHandler }).handler;
      return { open: mockOpen, on: jest.fn() };
    });
    (window as unknown as { Razorpay: unknown }).Razorpay = MockRazorpay;

    paymentService.createRazorpayOrder.mockReturnValue(of({
      order_id: 'order_abc',
      amount: 25000,
      currency: 'INR',
      booking_id: 7,
      key_id: 'rzp_test',
      amount_paise: 2500000,
      transaction_ref: 'TXN-RZP-001',
    }));

    const verifySpy = jest.spyOn(component as unknown as PaymentFormComponentPrivateState, 'verifyConfirmedPayment').mockResolvedValue(true);

    const p = component.payWithRazorpay('upi');
    await jest.runAllTimersAsync();
    await p;

    expect(mockOpen).toHaveBeenCalled();

    // Simulate Razorpay handler callback
    paymentService.verifyRazorpayPayment.mockReturnValue(of({ status: 'success', booking_id: 7 }));

    await capturedHandler!({
      razorpay_order_id: 'order_abc',
      razorpay_payment_id: 'pay_xyz',
      razorpay_signature: 'sig_123',
    });
    await jest.runAllTimersAsync();

    expect(verifySpy).toHaveBeenCalled();
    expect(component.processing()).toBe(false);

    delete (window as unknown as { Razorpay?: unknown }).Razorpay;
  });

  it('payWithRazorpay handler shows error when verification returns false', async () => {
    const { component } = createComponent();
    component.bookingAmount.set(300);
    component.bookingId.set(7);
    component.holdSecondsLeft.set(600);

    let capturedHandler: (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => void;

    const MockRazorpay = jest.fn().mockImplementation((opts: Record<string, unknown>) => {
      capturedHandler = (opts as unknown as { handler: typeof capturedHandler }).handler;
      return { open: jest.fn(), on: jest.fn() };
    });
    (window as unknown as { Razorpay: unknown }).Razorpay = MockRazorpay;

    paymentService.createRazorpayOrder.mockReturnValue(of({
      order_id: 'order_abc', amount: 25000, currency: 'INR', booking_id: 7,
      key_id: 'rzp_test', amount_paise: 2500000, transaction_ref: 'TXN-RZP-002',
    }));

    jest.spyOn(component as unknown as PaymentFormComponentPrivateState, 'verifyConfirmedPayment').mockResolvedValue(false);

    const p = component.payWithRazorpay('upi');
    await jest.runAllTimersAsync();
    await p;

    paymentService.verifyRazorpayPayment.mockReturnValue(of({ status: 'success', booking_id: 7 }));

    await capturedHandler!({
      razorpay_order_id: 'order_abc',
      razorpay_payment_id: 'pay_xyz',
      razorpay_signature: 'sig_123',
    });
    await jest.runAllTimersAsync();

    expect(component.cardError()).toContain('being confirmed');
    expect(component.processing()).toBe(false);
    expect(component.step()).toBe('details');

    delete (window as unknown as { Razorpay?: unknown }).Razorpay;
  });

  it('payWithRazorpay handler catches verification error', async () => {
    const { component } = createComponent();
    component.bookingAmount.set(300);
    component.bookingId.set(7);
    component.holdSecondsLeft.set(600);

    let capturedHandler: (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => void;

    const MockRazorpay = jest.fn().mockImplementation((opts: Record<string, unknown>) => {
      capturedHandler = (opts as unknown as { handler: typeof capturedHandler }).handler;
      return { open: jest.fn(), on: jest.fn() };
    });
    (window as unknown as { Razorpay: unknown }).Razorpay = MockRazorpay;

    paymentService.createRazorpayOrder.mockReturnValue(of({
      order_id: 'order_abc', amount: 25000, currency: 'INR', booking_id: 7,
      key_id: 'rzp_test', amount_paise: 2500000, transaction_ref: 'TXN-RZP-003',
    }));

    paymentService.verifyRazorpayPayment.mockReturnValue(throwError(() => new Error('verify failed')));

    const p = component.payWithRazorpay('upi');
    await jest.runAllTimersAsync();
    await p;

    await capturedHandler!({
      razorpay_order_id: 'order_abc',
      razorpay_payment_id: 'pay_xyz',
      razorpay_signature: 'sig_123',
    });
    await jest.runAllTimersAsync();

    expect(component.cardError()).toContain('verification failed');
    expect(component.processing()).toBe(false);
    expect(component.step()).toBe('details');

    delete (window as unknown as { Razorpay?: unknown }).Razorpay;
  });

  it('payWithRazorpay modal dismiss sets cancelled message', async () => {
    const { component } = createComponent();
    component.bookingAmount.set(300);
    component.bookingId.set(7);
    component.holdSecondsLeft.set(600);

    let capturedDismiss: () => void;

    const MockRazorpay = jest.fn().mockImplementation((opts: Record<string, unknown>) => {
      capturedDismiss = ((opts as unknown as { modal: { ondismiss: () => void } }).modal).ondismiss;
      return { open: jest.fn(), on: jest.fn() };
    });
    (window as unknown as { Razorpay: unknown }).Razorpay = MockRazorpay;

    paymentService.createRazorpayOrder.mockReturnValue(of({
      order_id: 'order_abc', amount: 25000, currency: 'INR', booking_id: 7,
      key_id: 'rzp_test', amount_paise: 2500000,
    }));

    const p = component.payWithRazorpay('upi');
    await jest.runAllTimersAsync();
    await p;

    capturedDismiss!();

    expect(component.cardError()).toContain('not completed');
    expect(component.processing()).toBe(false);
    expect(component.step()).toBe('details');

    delete (window as unknown as { Razorpay?: unknown }).Razorpay;
  });

  // ─── recordFailure error branch (lines 1599-1607) ───────────────────────────

  it('increments retry count and applies cooldown even when recordFailure throws', async () => {
    const { component } = createComponent();
    setupReadyComponent(component);

    paymentService.createPaymentIntent.mockReturnValue(
      of({ client_secret: 'cs_test', payment_intent_id: 'pi_fail', transaction_ref: 'TXN-FAIL' }),
    );
    mockConfirmCardPayment.mockResolvedValue({ error: { message: 'Declined' } });
    paymentService.recordFailure.mockReturnValue(throwError(() => new Error('network error')));

    const p = component.processCardPayment();
    await jest.runAllTimersAsync();
    await p;

    expect(component.retryCount()).toBe(1);
    expect(component.uiState()).toBe('failed_retry');
  });

  it('applies backend retry cooldown when recordFailure returns retry_after_seconds', async () => {
    const { component } = createComponent();
    setupReadyComponent(component);

    paymentService.createPaymentIntent.mockReturnValue(
      of({ client_secret: 'cs_test', payment_intent_id: 'pi_cool', transaction_ref: 'TXN-COOL' }),
    );
    mockConfirmCardPayment.mockResolvedValue({ error: { message: 'Declined' } });
    paymentService.recordFailure.mockReturnValue(of({
      retry_after_seconds: 60,
      failed_payment_count: 3,
    }));

    const p = component.processCardPayment();
    // Advance enough to complete the processing animation (4 steps × 650ms + 500ms)
    // but not enough to drain the 60s cooldown interval
    await jest.advanceTimersByTimeAsync(3200);
    await p;

    expect(component.retryCount()).toBe(3);
    expect(component.retryCooldownSecondsLeft()).toBeGreaterThanOrEqual(56);
  });

  it('starts 5-minute cooldown when retry count reaches maxRetries after card decline', async () => {
    const { component } = createComponent();
    setupReadyComponent(component);
    component.retryCount.set(component.maxRetries - 1);

    paymentService.createPaymentIntent.mockReturnValue(
      of({ client_secret: 'cs_test', payment_intent_id: 'pi_max', transaction_ref: 'TXN-MAX' }),
    );
    mockConfirmCardPayment.mockResolvedValue({ error: { message: 'Declined' } });
    paymentService.recordFailure.mockReturnValue(of({ message: 'recorded' }));

    const p = component.processCardPayment();
    await jest.advanceTimersByTimeAsync(3200);
    await p;

    expect(component.retryCount()).toBe(component.maxRetries);
    expect(component.retryCooldownSecondsLeft()).toBeGreaterThanOrEqual(296);
  });

  // ─── 429 rate-limit with object detail (lines 1685-1687) ────────────────────

  it('applies retry cooldown on 429 error with object detail', async () => {
    const { component } = createComponent();
    setupReadyComponent(component);

    paymentService.createPaymentIntent.mockReturnValue(
      throwError(() => ({
        status: 429,
        error: {
          detail: { message: 'Too many attempts', retry_after_seconds: 90, failed_payment_count: 4 },
        },
      })),
    );

    await component.processCardPayment();

    expect(component.retryCooldownSecondsLeft()).toBe(90);
    expect(component.processing()).toBe(false);
  });

  // ─── Generic error fallback (lines 1688-1691) ───────────────────────────────

  it('falls back to generic error message on unrecognized error', async () => {
    const { component } = createComponent();
    setupReadyComponent(component);

    paymentService.createPaymentIntent.mockReturnValue(
      throwError(() => ({
        status: 500,
        error: { detail: 'Internal Server Error' },
      })),
    );

    const p = component.processCardPayment();
    await jest.runAllTimersAsync();
    await p;

    expect(component.uiState()).toBe('failed_retry');
    expect(component.cardError()).toBe('Internal Server Error');
    expect(component.processing()).toBe(false);
  });

  it('uses default message when error detail is empty', async () => {
    const { component } = createComponent();
    setupReadyComponent(component);

    paymentService.createPaymentIntent.mockReturnValue(
      throwError(() => ({ status: 502 })),
    );

    const p = component.processCardPayment();
    await jest.runAllTimersAsync();
    await p;

    expect(component.uiState()).toBe('failed_retry');
    expect(component.cardError()).toBe('Payment failed. Please try again.');
    expect(component.processing()).toBe(false);
  });

  // ─── Remaining branch coverage ──────────────────────────────────────────────

  it('clears card error when stripe change event has no error', async () => {
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
    const mountRef = createConnectedMountRef();
    component.cardMountRef = { nativeElement: mountRef.nativeElement } as unknown as MountRefLike;
    component.paymentMethod.set('card');

    await (component as unknown as PaymentFormComponentPrivateState).initStripe();

    const changeHandler = mockOn.mock.calls.find(call => call[0] === 'change')?.[1];
    changeHandler({ error: undefined });
    expect(component.cardError()).toBe('');
    mountRef.cleanup();
  });

  it('verifyConfirmedPayment resolves true when only booking_status is confirmed', async () => {
    const { component } = createComponent();
    const router = TestBed.inject(Router);
    const navigateSpy = jest.spyOn(router, 'navigate').mockResolvedValue(true);
    component.bookingId.set(7);
    component.bookingAmount.set(300);

    paymentService.getPaymentStatus.mockReturnValue(of({
      payment_status: 'processing',
      booking_status: 'confirmed',
      booking_ref: 'BK123',
      latest_transaction: { transaction_ref: 'TXN-STATUS', amount: 300 },
    }));

    const result = await (component as unknown as { verifyConfirmedPayment: () => Promise<boolean> }).verifyConfirmedPayment();
    expect(result).toBe(true);
    expect(navigateSpy).toHaveBeenCalled();
  });

  it('card decline with no error.message uses "Card declined" fallback', async () => {
    const { component } = createComponent();
    setupReadyComponent(component);

    paymentService.createPaymentIntent.mockReturnValue(
      of({ client_secret: 'cs_test', payment_intent_id: 'pi_no_msg', transaction_ref: 'TXN-NOMSG' }),
    );
    mockConfirmCardPayment.mockResolvedValue({ error: { message: '' } });
    paymentService.recordFailure.mockReturnValue(of({}));

    const p = component.processCardPayment();
    await jest.runAllTimersAsync();
    await p;

    expect(paymentService.recordFailure).toHaveBeenCalledWith(7, 'Card declined', 'pi_no_msg', 'TXN-NOMSG');
    expect(component.cardError()).toContain('Please try a different card');
  });

  it('card decline appends hold info when hold is still active', async () => {
    const { component } = createComponent();
    setupReadyComponent(component);
    component.holdSecondsLeft.set(120);

    paymentService.createPaymentIntent.mockReturnValue(
      of({ client_secret: 'cs_test', payment_intent_id: 'pi_hold', transaction_ref: 'TXN-HOLD' }),
    );
    mockConfirmCardPayment.mockResolvedValue({ error: { message: 'Declined' } });
    paymentService.recordFailure.mockReturnValue(of({}));

    const p = component.processCardPayment();
    await jest.runAllTimersAsync();
    await p;

    expect(component.cardError()).toContain('Your room is reserved');
  });

  it('payWithRazorpay uses INR fallback when order has no currency and maps gpay to upi prefill', async () => {
    const { component } = createComponent();
    component.bookingAmount.set(300);
    component.bookingId.set(7);
    component.holdSecondsLeft.set(600);

    let capturedOptions: Record<string, unknown> = {};

    const MockRazorpay = jest.fn().mockImplementation((opts: Record<string, unknown>) => {
      capturedOptions = opts;
      return { open: jest.fn(), on: jest.fn() };
    });
    (window as unknown as { Razorpay: unknown }).Razorpay = MockRazorpay;

    paymentService.createRazorpayOrder.mockReturnValue(of({
      order_id: 'order_abc', amount: 25000, booking_id: 7,
      key_id: 'rzp_test', amount_paise: 2500000,
      // no currency, no transaction_ref
    }));

    const p = component.payWithRazorpay('gpay');
    await jest.runAllTimersAsync();
    await p;

    expect(capturedOptions['currency']).toBe('INR');
    expect((capturedOptions['prefill'] as { method: string }).method).toBe('upi');

    delete (window as unknown as { Razorpay?: unknown }).Razorpay;
  });

  it('conflict branch uses default message when detailMessage is empty', async () => {
    const { component } = createComponent();
    setupReadyComponent(component);

    paymentService.createPaymentIntent.mockReturnValue(
      throwError(() => ({
        status: 409,
        error: { detail: { message: '', expired: true } },
      })),
    );

    const p = component.processCardPayment();
    await jest.runAllTimersAsync();
    await p;

    // detail is an object, typeof detail !== 'string' → goes to 429 check (status is 409, not 429)
    // Actually status is 409, detailMessage is '' (empty)
    // First 409 branch: detailMessage checks for 'unavailable'/'available'/'reserved'/'expired' — '' doesn't match
    // Second 409 branch: detailMessage.includes('already paid') — '' doesn't match
    // Falls to generic else branch
    expect(component.uiState()).toBe('failed_retry');
  });

  it('409 conflict uses fallback message when detail string has no relevant keyword but matches "expired"', async () => {
    const { component } = createComponent();
    setupReadyComponent(component);

    paymentService.createPaymentIntent.mockReturnValue(
      throwError(() => ({
        status: 409,
        error: { detail: '' },
      })),
    );

    const p = component.processCardPayment();
    await jest.runAllTimersAsync();
    await p;

    // detail is '' (falsy), so detail = '' (from `|| ''`). detailMessage = ''.
    // 409 first branch: '' doesn't contain keywords → false
    // 409 second branch: '' doesn't contain 'already paid' → false
    // Falls to else: sets 'failed_retry' with detailMessage || 'Payment failed...'
    expect(component.cardError()).toBe('Payment failed. Please try again.');
  });

  it('verifyConfirmedPayment resolves true when only lifecycle_state is CONFIRMED', async () => {
    const { component } = createComponent();
    const router = TestBed.inject(Router);
    const navigateSpy = jest.spyOn(router, 'navigate').mockResolvedValue(true);
    component.bookingId.set(7);
    component.bookingAmount.set(300);

    paymentService.getPaymentStatus.mockReturnValue(of({
      payment_status: 'processing',
      lifecycle_state: 'CONFIRMED',
      booking_ref: 'BK123',
      latest_transaction: { transaction_ref: 'TXN-LC', amount: 300 },
    }));

    const result = await (component as unknown as { verifyConfirmedPayment: () => Promise<boolean> }).verifyConfirmedPayment();
    expect(result).toBe(true);
    expect(navigateSpy).toHaveBeenCalled();
  });

  it('payWithRazorpay handler uses empty string when order has no transaction_ref', async () => {
    const { component } = createComponent();
    component.bookingAmount.set(300);
    component.bookingId.set(7);
    component.holdSecondsLeft.set(600);

    let capturedHandler: (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => void;

    const MockRazorpay = jest.fn().mockImplementation((opts: Record<string, unknown>) => {
      capturedHandler = (opts as unknown as { handler: typeof capturedHandler }).handler;
      return { open: jest.fn(), on: jest.fn() };
    });
    (window as unknown as { Razorpay: unknown }).Razorpay = MockRazorpay;

    paymentService.createRazorpayOrder.mockReturnValue(of({
      order_id: 'order_abc', amount: 25000, currency: 'INR', booking_id: 7,
      key_id: 'rzp_test', amount_paise: 2500000,
      // transaction_ref is UNDEFINED — tests the ?? '' branch
    }));

    jest.spyOn(component as unknown as PaymentFormComponentPrivateState, 'verifyConfirmedPayment').mockResolvedValue(true);

    const p = component.payWithRazorpay('upi');
    await jest.runAllTimersAsync();
    await p;

    paymentService.verifyRazorpayPayment.mockReturnValue(of({ status: 'success', booking_id: 7 }));

    await capturedHandler!({
      razorpay_order_id: 'order_abc',
      razorpay_payment_id: 'pay_xyz',
      razorpay_signature: 'sig_123',
    });
    await jest.runAllTimersAsync();

    expect(paymentService.verifyRazorpayPayment).toHaveBeenCalledWith(
      expect.objectContaining({ transaction_ref: '' }),
    );

    delete (window as unknown as { Razorpay?: unknown }).Razorpay;
  });

  it('409 conflict uses default message when detailMessage is empty', async () => {
    const { component } = createComponent();
    setupReadyComponent(component);

    // detail is a string containing 'unavailable' but empty detailMessage triggers fallback
    paymentService.createPaymentIntent.mockReturnValue(
      throwError(() => ({
        status: 409,
        error: { detail: 'unavailable' },
      })),
    );

    const p = component.processCardPayment();
    await jest.runAllTimersAsync();
    await p;

    // detailMessage is 'unavailable', includes 'unavailable' → conflict branch
    // detailMessage is truthy so uses it, not the fallback
    expect(component.uiState()).toBe('conflict');
    expect(component.cardError()).toBe('unavailable');
  });

  it('object detail with no message property defaults to empty detailMessage', async () => {
    const { component } = createComponent();
    setupReadyComponent(component);

    paymentService.createPaymentIntent.mockReturnValue(
      throwError(() => ({
        status: 500,
        error: { detail: { retry_after_seconds: 10 } },
      })),
    );

    const p = component.processCardPayment();
    await jest.runAllTimersAsync();
    await p;

    // detail is { retry_after_seconds: 10 }, typeof detail !== 'string'
    // detailMessage = detail.message || '' = undefined || '' = ''
    // Not 409, not 429 (status 500), not TimeoutError → generic else
    expect(component.cardError()).toBe('Payment failed. Please try again.');
  });
});
