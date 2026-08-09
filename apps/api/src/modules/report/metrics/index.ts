/**
 * `report/metrics/` — analitika TZ §4 «yagona formulalar qatlami».
 * Har hisobot o'z formulasini yozmaydi; hammasi shu yerdan chaqiradi.
 */
export { UNKNOWN_CASHIER_ID, cashierSliceKey, isUnknownCashier } from './cashier-slice.js';
export {
  DATA_QUALITY,
  type DataQualityLevel,
  type QualitySample,
  aggregateQuality,
  countSamples,
  metricQuality,
  overallQuality,
  sharePercent,
} from './data-quality.js';
export {
  REPORT_PERCENT_DECIMALS,
  averageCheckMinor,
  grossProfitMinor,
  marginPercentText,
  markupPercentText,
  percent,
  percentText,
  returnRatePercent,
  returnRatePercentText,
} from './metrics.js';
