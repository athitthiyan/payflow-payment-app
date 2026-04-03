import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  PaymentStateResponse,
  Transaction,
  TransactionListResponse,
} from '../models/transaction.model';

@Injectable({ providedIn: 'root' })
export class PaymentService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/payments`;

  createPaymentIntent(bookingId: number, method: string = 'mock'): Observable<any> {
    return this.http.post(`${this.base}/create-payment-intent`, {
      booking_id: bookingId,
      payment_method: method,
    });
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

  recordFailure(bookingId: number, reason: string): Observable<any> {
    return this.http.post(`${this.base}/payment-failure`, null, {
      params: new HttpParams().set('booking_id', bookingId).set('reason', reason),
    });
  }

  getPaymentStatus(bookingId: number): Observable<PaymentStateResponse> {
    return this.http.get<PaymentStateResponse>(`${this.base}/status/${bookingId}`);
  }

  getTransactions(status?: string, page = 1, perPage = 10): Observable<TransactionListResponse> {
    let params = new HttpParams().set('page', page).set('per_page', perPage);
    if (status) params = params.set('status', status);
    return this.http.get<TransactionListResponse>(`${this.base}/transactions`, { params });
  }
}
