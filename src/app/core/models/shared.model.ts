export type TransactionStatus =
  | 'pending'
  | 'processing'
  | 'success'
  | 'failed'
  | 'expired'
  | 'refunded';

export interface RoomSummary {
  hotel_name: string;
  image_url?: string;
  location?: string;
}
