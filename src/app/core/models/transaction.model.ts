import type { TransactionStatus, RoomSummary } from './shared.model';

// Re-export for convenience within the payment app
export type { TransactionStatus } from './shared.model';

export interface Transaction {
  id: number;
  booking_id: number;
  transaction_ref: string;
  stripe_payment_intent_id?: string;
  amount: number;
  currency: string;
  payment_method: string;
  card_last4?: string;
  card_brand?: string;
  status: TransactionStatus;
  failure_reason?: string;
  created_at: string;
  booking?: {
    id: number;
    booking_ref: string;
    user_name: string;
    email: string;
    room?: RoomSummary;
    check_in: string;
    check_out: string;
    nights: number;
  };
}

export interface TransactionListResponse {
  transactions: Transaction[];
  total: number;
}

export interface PaymentStateResponse {
  booking_id: number;
  booking_ref: string;
  booking_status: string;
  payment_status: string;
  lifecycle_state?: string;
  latest_transaction: Transaction | null;
  failed_payment_count?: number;
  retry_after_seconds?: number;
  retry_available_at?: string | null;
}
