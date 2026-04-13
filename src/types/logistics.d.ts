/**
 * Logistics tracking node
 */
export interface LogisticsTrack {
  description: string;
  time: string;
  location?: string;
}

/**
 * Logistics status enum
 */
export type LogisticsStatus = 'PENDING' | 'PICKED_UP' | 'IN_TRANSIT' | 'DELIVERED' | 'EXCEPTION';

/**
 * Logistics info
 */
export interface LogisticsInfo {
  /** Carrier name */
  carrier: string;
  /** Tracking number */
  trackingNumber: string;
  /** Current status */
  status: LogisticsStatus;
  /** Estimated delivery text */
  deliveryEstimate?: string;
  /** Product cover image */
  productImage: string;
  /** Product title */
  productTitle: string;
  /** Total product quantity */
  totalQuantity: number;
  /** Logistics timeline (latest first) */
  tracks: LogisticsTrack[];
}
