import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';

import { PaymentService } from './payment.service';
import { environment } from '../../../environments/environment';

describe('PaymentService', () => {
  let service: PaymentService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(PaymentService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('creates a payment intent', () => {
    service.createPaymentIntent(12, 'card').subscribe();

    const req = httpMock.expectOne(`${environment.apiUrl}/payments/create-payment-intent`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ booking_id: 12, payment_method: 'card' });
    req.flush({});
  });

  it('creates a payment intent with the default card payment method', () => {
    service.createPaymentIntent(12).subscribe();

    const req = httpMock.expectOne(`${environment.apiUrl}/payments/create-payment-intent`);
    expect(req.request.body).toEqual({ booking_id: 12, payment_method: 'card' });
    req.flush({});
  });

  it('creates a payment intent with an idempotency key', () => {
    service.createPaymentIntent(12, 'card', 'idem-123').subscribe();

    const req = httpMock.expectOne(`${environment.apiUrl}/payments/create-payment-intent`);
    expect(req.request.body).toEqual({
      booking_id: 12,
      payment_method: 'card',
      idempotency_key: 'idem-123',
    });
    req.flush({});
  });

  it('extends the booking hold', () => {
    service.extendHold(33, 'guest@example.com').subscribe();

    const req = httpMock.expectOne(`${environment.apiUrl}/bookings/33/extend-hold`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: 'guest@example.com' });
    req.flush({});
  });

  it('records payment failure', () => {
    service.recordFailure(45, 'Card declined').subscribe();

    const req = httpMock.expectOne(
      `${environment.apiUrl}/payments/payment-failure?booking_id=45&reason=Card%20declined`
    );
    expect(req.request.method).toBe('POST');
    req.flush({});
  });

  it('records payment failure with payment intent and transaction reference', () => {
    service.recordFailure(45, 'Card declined', 'pi_123', 'TXN-123').subscribe();

    const req = httpMock.expectOne(
      `${environment.apiUrl}/payments/payment-failure?booking_id=45&reason=Card%20declined&payment_intent_id=pi_123&transaction_ref=TXN-123`,
    );
    expect(req.request.method).toBe('POST');
    req.flush({});
  });

  it('fetches payment status', () => {
    service.getPaymentStatus(88).subscribe();

    const req = httpMock.expectOne(`${environment.apiUrl}/payments/status/88`);
    expect(req.request.method).toBe('GET');
    req.flush({
      booking_id: 88,
      booking_ref: 'BK123',
      booking_status: 'confirmed',
      payment_status: 'paid',
      latest_transaction: null,
    });
  });

  it('fetches transactions without a status filter by default', () => {
    service.getTransactions().subscribe();

    const req = httpMock.expectOne(
      `${environment.apiUrl}/payments/transactions?page=1&per_page=10`,
    );
    expect(req.request.method).toBe('GET');
    req.flush({ transactions: [], total: 0, page: 1, per_page: 10 });
  });

  it('fetches transactions with an explicit status filter', () => {
    service.getTransactions('paid', 2, 25).subscribe();

    const req = httpMock.expectOne(
      `${environment.apiUrl}/payments/transactions?page=2&per_page=25&status=paid`,
    );
    expect(req.request.method).toBe('GET');
    req.flush({ transactions: [], total: 0, page: 2, per_page: 25 });
  });
});
