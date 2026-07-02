/**
 * Shared types for the Inventerizatsiya sub-routes (dashboard / count / cycle /
 * approvals / reports). Extracted from the legacy single-page implementation to
 * back the ref-parity route split (P-I).
 */

export type Status = 'green' | 'yellow' | 'red';

export interface Summary {
  total: number;
  green: number;
  yellow: number;
  red: number;
  pendingApproval: number;
  lossMinor: string;
  surplusMinor: string;
  netMinor: string;
}

export interface CountProductRow {
  productId: string;
  name: string;
  code: string | null;
  expectedQty: number;
  salePriceMinor: string;
  kamQty: number;
  kopQty: number;
  status: Status | null;
  decision: string | null;
}
export interface ProductsResponse {
  storeId: string | null;
  items: CountProductRow[];
}

export interface CountDto {
  id: string;
  productName: string;
  productCode: string | null;
  expectedQty: number;
  kamQty: number;
  kopQty: number;
  netQty: number;
  status: Status;
  decision: string | null;
  countedAt: string;
}
export interface CountListResponse {
  items: CountDto[];
  total: number;
}

export interface ReasonCode {
  id: string;
  label: string;
  active: boolean;
}
export interface ReasonListResponse {
  items: ReasonCode[];
}

export type View = 'pending' | 'accepted' | 'rejected' | 'all';

export type Period = 'today' | '7d' | '30d' | 'all';
export type RTab = 'product' | 'counter' | 'group' | 'reason' | 'top';

export interface ReportBucket {
  key: string;
  label: string;
  count: number;
  moneyMinor: string;
}
export interface ReportProductRow {
  productId: string;
  name: string;
  code: string | null;
  groupName: string | null;
  expectedQty: number;
  netQty: number;
  pct: number;
  salePriceMinor: string;
  moneyMinor: string;
  status: Status;
  counterName: string;
  countedAt: string;
}
export interface CountReport {
  lossMinor: string;
  surplusMinor: string;
  netMinor: string;
  byProduct: ReportProductRow[];
  byCounter: ReportBucket[];
  byGroup: ReportBucket[];
  byReason: ReportBucket[];
  top10: ReportProductRow[];
}
