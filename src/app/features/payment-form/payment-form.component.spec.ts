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
  navigateToSuccess: (ref: string, amount: number, bookingRef?: string) => void;
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
    const router = TestBed.inject(Router);
    const navigateSpy = jest.spyOn(router, 'navigate').mockResolvedValue(true);

    component.bookingId.set(7);
    component.bookingAmount.set(123);
    paymentService.getPaymentStatus
      .mockReturnValueOnce(of({ payment_status: 'pending' }))
      .mockReturnValueOnce(of({
        payment_status: 'paid',
        booking_ref: 'BK123',
        latest_transaction: { transaction_ref: 'TXN-LATE', amount: 123 },
      }));

    const promise = (component as unknown as PaymentFormComponentPrivateState).verifyConfirmedPayment();
    await jest.advanceTimersByTimeAsync(1500);
    await promise;

    expect(navigateSpy).toHaveBeenCalledWith(['/success'], {
      queryParams: {
        ref: 'TXN-LATE',
        amount: 123,
        booking_id: 7,
        booking_ref: 'BK123',
      },
    });
  });

  it('returns false when payment confirmation polling never succeeds', async () => {
    const { component } = createComponent();
    component.bookingId.set(7);
    paymentService.getPaymentStatus.mockReturnValue(throwError(() => new Error('nope')));

    const promise = (component as unknown as PaymentFormComponentPrivateState).verifyConfirmedPayment();
    for (let i = 0; i < 6; i++) {
      await jest.advanceTimersByTimeAsync(1500);
    }

    await expect(promise).resolves.toBe(false);
  });

  it('clears the card error when the stripe change event has no validation error', async () => {
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
    component.cardMountRef = { nativeElement: mountRef.nativeElement } as never;
    component.paymentMethod.set('card');
    component.cardError.set('Old error');

    await (component as unknown as { initStripe: () => Promise<void> }).initStripe();

    const changeHandler = mockOn.mock.calls.find(call => call[0] === 'change')?.[1] as ((event: { error?: { message?: string } }) => void);
    changeHandler({});

    expect(component.cardError()).toBe('');
    mountRef.cleanup();
  });

  it('handles declined card errors without a Stripe message and with an active hold countdown', async () => {
    const { component } = createComponent();
    setupReadyComponent(component);
    component.holdSecondsLeft.set(125);

    paymentService.createPaymentIntent.mockReturnValue(
      of({
        client_secret: 'cs_test_123',
        payment_intent_id: 'pi_declined_002',
        transaction_ref: 'TXN-DECLINED-002',
      }),
    );
    mockConfirmCardPayment.mockResolvedValue({ error: {} });
    paymentService.recordFailure.mockReturnValue(of({}));

    const promise = component.processCardPayment();
    await jest.runAllTimersAsync();
    await promise;

    expect(paymentService.recordFailure).toHaveBeenCalledWith(
      7,
      'Card declined',
      'pi_declined_002',
      'TXN-DECLINED-002',
    );
    expect(component.cardError()).toContain('Payment failed.');
    expect(component.cardError()).toContain('02:05');
  });

  it('continues retry recovery when recording a declined payment fails', async () => {
    const { component } = createComponent();
    setupReadyComponent(component);

    paymentService.createPaymentIntent.mockReturnValue(
      of({
        client_secret: 'cs_test_124',
        payment_intent_id: 'pi_declined_003',
        transaction_ref: 'TXN-DECLINED-003',
      }),
    );
    mockConfirmCardPayment.mockResolvedValue({ error: { message: 'Declined again' } });
    paymentService.recordFailure.mockReturnValue(throwError(() => new Error('record failed')));

    const promise = component.processCardPayment();
    await jest.runAllTimersAsync();
    await promise;

    expect(component.uiState()).toBe('failed_retry');
    expect(component.cardError()).toContain('Declined again');
  });

  it('falls back to the default conflict message when a conflict detail is empty', async () => {
    const { component } = createComponent();
    setupReadyComponent(component);

    paymentService.createPaymentIntent.mockReturnValue(
      throwError(() => ({ status: 409, error: { detail: '' } })),
    );

    const promise = component.processCardPayment();
    await jest.runAllTimersAsync();
    await promise;

    expect(component.uiState()).toBe('failed_retry');
    expect(component.cardError()).toBe('Payment failed. Please try again.');
  });

  it('uses the generic failure message when the backend error detail is empty', async () => {
    const { component } = createComponent();
    setupReadyComponent(component);

    paymentService.createPaymentIntent.mockReturnValue(
      throwError(() => ({ status: 500, error: { detail: '' } })),
    );

    const promise = component.processCardPayment();
    await jest.runAllTimersAsync();
    await promise;

    expect(component.uiState()).toBe('failed_retry');
    expect(component.cardError()).toBe('Payment failed. Please try again.');
  });

  it('uses the default conflict message when availability conflicts return an empty detail', async () => {
    const { component } = createComponent();
    setupReadyComponent(component);
    const includesSpy = jest.spyOn(String.prototype, 'includes').mockReturnValue(true);

    paymentService.createPaymentIntent.mockReturnValue(
      throwError(() => ({ status: 409, error: { detail: '' } })),
    );

    const promise = component.processCardPayment();
    await jest.runAllTimersAsync();
    await promise;

    expect(component.uiState()).toBe('conflict');
    expect(component.cardError()).toBe(
      'These dates are no longer available. Please go back and select new dates.',
    );

    includesSpy.mockRestore();
  });
});
