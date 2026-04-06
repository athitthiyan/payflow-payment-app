import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  PaymentStateResponse,
  Transaction,
  TransactionListResponse,
} from '../models/transaction.model';

interface PaymentIntentResponse {
  client_secret: string;
  payment_intent_id?: string;
  transaction_ref?: string;
  retry_after_seconds?: number;
  failed_payment_count?: number;
  retry_available_at?: string | null;
}

interface ExtendHoldResponse {
  message: string;
  hold_expires_at?: string | null;
}

interface PaymentFailureResponse {
  message: string;
  booking_id?: number;
  reason?: string;
  payment_intent_id?: string;
  transaction_ref?: string;
  failed_payment_count?: number;
  retry_after_seconds?: number;
  retry_available_at?: string | null;
}

export interface PaymentCooldownDetail {
  code?: string;
  message?: string;
  blocked?: boolean;
  failed_payment_count?: number;
  retry_after_seconds?: number;
  retry_available_at?: string | null;
}

@Injectable({ providedIn: 'root' })
export class PaymentService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/payments`;

  createPaymentIntent(bookingId: number, method: string = 'card', idempotencyKey?: string): Observable<PaymentIntentResponse> {
    return this.http.post<PaymentIntentResponse>(`${this.base}/create-payment-intent`, {
      booking_id: bookingId,
      payment_method: method,
      ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
    });
  }

  extendHold(bookingId: number, email: string): Observable<ExtendHoldResponse> {
    return this.http.post<ExtendHoldResponse>(`${environment.apiUrl}/bookings/${bookingId}/extend-hold`, { email });
  }

  confirmPayment(payload: {
    booking_id: number;
    transaction_ref: string;
    payment_intent_id?: string;
    payment_method: string;
    card_last4?: string;
    card_brand?: string;
  }): Observable<Transaction> {
    return this.http.post<Transaction>(`${this.base}/payment-success`, payload);
  }

  recordFailure(
    bookingId: number,
    reason: string,
    paymentIntentId?: string,
    transactionRef?: string,
  ): Observable<PaymentFailureResponse> {
    let params = new HttpParams().set('booking_id', bookingId).set('reason', reason);
    if (paymentIntentId) {
      params = params.set('payment_intent_id', paymentIntentId);
    }
    if (transactionRef) {
      params = params.set('transaction_ref', transactionRef);
    }
    return this.http.post<PaymentFailureResponse>(`${this.base}/payment-failure`, null, { params });
  }

  getPaymentStatus(bookingId: number): Observable<PaymentStateResponse> {
    return this.http.get<PaymentStateResponse>(`${this.base}/status/${bookingId}`);
  }

  createRazorpayOrder(bookingId: number, paymentMethod: string, idempotencyKey?: string): Observable<any> {
    return this.http.post<any>(`${this.base}/razorpay/create-order`, {
      booking_id: bookingId,
      payment_method: paymentMethod,
      ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
    });
  }

  verifyRazorpayPayment(data: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
    transaction_ref: string;
  }): Observable<any> {
    return this.http.post<any>(`${this.base}/razorpay/verify-payment`, data);
  }
}