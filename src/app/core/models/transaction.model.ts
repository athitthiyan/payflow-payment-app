export type TransactionStatus = 'pending' | 'processing' | 'success' | 'failed' | 'expired' | 'refunded';

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
    room?: { hotel_name: string; image_url?: string; location?: string };
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
  latest_transaction: Transaction | null;
}
