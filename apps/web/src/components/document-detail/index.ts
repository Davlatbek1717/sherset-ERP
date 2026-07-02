/**
 * Shared document-detail components — moysklad parity for all
 * detail pages (sales, purchase, warehouse, money documents).
 *
 * Each detail page composes:
 *   <DetailToolbar />   → top toolbar (Save / Close / dropdowns)
 *   <DetailHeader />    → title + state pill + Provedeno toggle + author
 *   <main>{form fields}</main>
 *     <PositionEditor /> + <DetailTotalsSidebar />  (when positions exist)
 */

export { DetailToolbar } from './detail-toolbar';
export type { DetailToolbarProps, CreateMenuItem } from './detail-toolbar';

export { DetailHeader } from './detail-header';
export type { DetailHeaderProps, StateTone } from './detail-header';

export { DetailTotalsSidebar } from './detail-totals-sidebar';
export type { DetailTotalsSidebarProps } from './detail-totals-sidebar';

export { DetailContentTabs } from './detail-content-tabs';
export type { DetailContentTabsProps } from './detail-content-tabs';

export { DocumentHistoryLink } from './document-history-link';
