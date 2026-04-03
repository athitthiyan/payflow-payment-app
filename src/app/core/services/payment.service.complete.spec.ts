/**
 * Extended branch-coverage tests for PaymentService
 * Covers branches missing from payment.service.spec.ts:
 *   – confirmPayment HTTP call
 *   – getTransactions without status filter (branch: if(status) skipped)
 *   – getTransactions with status filter (branch: if(status) taken)
 */

import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';

import { PaymentService } from './payment.service';
import { environment } from '../../../environments/environment';

describe('PaymentService (extended branches)', () => {
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

  describe('confirmPayment', () => {
    it('POSTs to /payments/payment-success with full payload', () => {
      const payload = {
        booking_id: 7,
        transaction_ref: 'TXN-ABC123',
        payment_intent_id: 'pi_xyz',
        payment_method: 'card',
        card_last4: '4242',
        card_brand: 'Visa',
      };
      service.confirmPayment(payload).subscribe(result => {
        expect(result).toEqual({ id: 1, status: 'success' });
      });
      const req = httpMock.expectOne(`${environment.apiUrl}/payments/payment-success`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(payload);
      req.flush({ id: 1, status: 'success' });
    });

    it('POSTs to /payments/payment-success with minimal payload (no optional fields)', () => {
      const payload = {
        booking_id: 8,
        transaction_ref: 'TXN-MIN',
        payment_method: 'mock',
      };
      service.confirmPayment(payload).subscribe();
      const req = httpMock.expectOne(`${environment.apiUrl}/payments/payment-success`);
      req.flush({});
    });
  });

  describe('getTransactions', () => {
    it('fetches transactions without status filter (status param absent)', () => {
      service.getTransactions(undefined, 1, 10).subscribe();
      const req = httpMock.expectOne(
        r =>
          r.url === `${environment.apiUrl}/payments/transactions` &&
          r.params.get('page') === '1' &&
          r.params.get('per_page') === '10' &&
          !r.params.has('status'),
      );
      expect(req.request.method).toBe('GET');
      req.flush({ transactions: [], total: 0 });
    });

    it('fetches transactions with status filter (status param present)', () => {
      service.getTransactions('success', 2, 25).subscribe();
      const req = httpMock.expectOne(
        r =>
          r.url === `${environment.apiUrl}/payments/transactions` &&
          r.params.get('status') === 'success' &&
          r.params.get('page') === '2' &&
          r.params.get('per_page') === '25',
      );
      expect(req.request.method).toBe('GET');
      req.flush({ transactions: [], total: 0 });
    });

    it('uses default page=1 and perPage=10 when not specified', () => {
      service.getTransactions().subscribe();
      const req = httpMock.expectOne(
        r =>
          r.url === `${environment.apiUrl}/payments/transactions` &&
          r.params.get('page') === '1' &&
          r.params.get('per_page') === '10',
      );
      req.flush({ transactions: [], total: 0 });
    });
  });
});
