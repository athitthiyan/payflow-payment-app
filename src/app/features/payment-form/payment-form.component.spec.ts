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
  };
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    jest.useFakeTimers();
    mockMount.mockReset();
    mockOn.mockReset();
    mockDestroy.mockReset();
    mockConfirmCardPayment.mockReset();
    mockCreate.mockReset();
    mockElements.mockReset().mockReturnValue({ create: mockCreate });
    mockLoadStripe.mockReset();

    paymentService = {
      confirmPayment: jest.fn(),
      recordFailure: jest.fn(),
      createPaymentIntent: jest.fn(),
      getPaymentStatus: jest.fn(),
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

  function withDestroyableCardElement(component: PaymentFormComponent) {
    (component as any).cardElement = { destroy: mockDestroy };
  }

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
    expect(component.cardError()).toContain('Booking details are still loading');

    component.bookingAmount.set(100);
    await component.processCardPayment();
    expect(component.cardError()).toContain('Please enter the cardholder name');

    component.cardholderName = 'Athit';
    await component.processCardPayment();
    expect(component.cardError()).toContain('Payment system is not ready');

    (component as any).stripe = {};
    withDestroyableCardElement(component);
    await component.processCardPayment();
    expect(component.cardError()).toContain('Secure card form is still initializing');
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

  it('verifies confirmed payment when backend reports already paid', async () => {
    const { component } = createComponent();
    const router = TestBed.inject(Router);
    const navigateSpy = jest.spyOn(router, 'navigate').mockResolvedValue(true);

    component.bookingId.set(7);
    component.bookingAmount.set(100);
    component.cardholderName = 'Athit';
    component.cardElementReady.set(true);
    (component as any).stripe = {};
    withDestroyableCardElement(component);

    paymentService.createPaymentIntent.mockReturnValue(
      throwError(() => ({ error: { detail: 'Booking already paid' } }))
    );
    jest
      .spyOn(component as any, 'verifyConfirmedPayment')
      .mockResolvedValue(true);

    await component.processCardPayment();

    expect((component as any).verifyConfirmedPayment).toHaveBeenCalled();
    expect(navigateSpy).not.toHaveBeenCalled();
  });
});
