export interface ExtractedItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

export interface ParsedReceipt {
  merchant: string;
  date: string;
  currency: string;
  items: ExtractedItem[];
  subtotal: number;
  tax: number;
  service_charge: number;
  tip: number;
  discount: number;
  grand_total: number;
}

export interface ScanResponse {
  receipt: ParsedReceipt;
  warnings: string[];
  source: "preset" | "vision";
}

export interface Participant {
  id: string;
  name: string;
  avatar_color: string;
  upi_id?: string;
  paypal_handle?: string;
}

export interface ParticipantBreakdown {
  participant_id: string;
  name: string;
  raw_subtotal: number;
  proportional_tax: number;
  proportional_fees_and_tips: number;
  proportional_discount: number;
  proportional_adjustment: number;
  final_amount: number;
  assigned_items: string[];
  is_organizer: boolean;
  payment_link_upi: string;
  payment_link_paypal: string;
}

export interface SplitCalculationResponse {
  is_balanced: boolean;
  receipt_total: number;
  calculated_sum: number;
  unassigned_amount: number;
  receipt_adjustment: number;
  breakdowns: ParticipantBreakdown[];
}

export interface SplitCalculationRequest {
  receipt: ParsedReceipt;
  participants: Participant[];
  item_assignments: Record<string, string[]>;
  custom_shares: Record<string, Record<string, number>>;
  organizer_id: string | null;
}
