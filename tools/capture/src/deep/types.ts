/**
 * Deep-capture artifact types.
 *
 * Each interaction produces a `CaptureArtifact` — one folder on disk with:
 *   - screenshot.png (retina)
 *   - dom.html (rendered DOM)
 *   - meta.json (structured observation)
 */

export interface Bbox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface InteractiveEl {
  /** Short text (for button/link labels) — truncated to 80 chars */
  label: string;
  /** DOM tag (BUTTON, A, INPUT, ...) */
  tag: string;
  /** Computed role (button, link, ...) */
  role: string | null;
  /** Bounding box on page at capture time */
  bbox: Bbox;
  /** aria-label, if present */
  ariaLabel: string | null;
  /** title attribute, if present */
  title: string | null;
  /** disabled flag */
  disabled: boolean;
  /** CSS class list (first 80 chars) */
  cls: string;
  /** Visible state */
  visible: boolean;
}

export type PageKind =
  | 'list' // Has toolbar + table
  | 'edit' // Create / edit form
  | 'detail' // Read-only detail view
  | 'report' // Aggregated report
  | 'special' // Dashboard, POS, custom
  | 'settings' // Admin settings page
  | 'unknown';

export interface PageProfile {
  /** Route id from routes.ts */
  routeId: string;
  /** URL fragment (#purchaseorder) */
  hash: string;
  /** Detected kind */
  kind: PageKind;
  /** DOM signatures discovered */
  signatures: {
    hasTable: boolean;
    hasForm: boolean;
    hasToolbar: boolean;
    hasSubNav: boolean;
    hasEmptyState: boolean;
    interactiveCount: number;
    bodyHeight: number;
  };
  /** H1 title, if any */
  title: string | null;
}

/** One captured interaction artifact. */
export interface CaptureArtifact {
  /** Sequence number within the page (01-, 02-, ...) */
  seq: number;
  /** Short kebab-case name (e.g., 'default', 'filter-panel', 'dropdown-status') */
  id: string;
  /** Human-readable label */
  label: string;
  /** Parent page route */
  routeId: string;
  /** When captured */
  at: string;
  /** Absolute path to screenshot */
  screenshotPath: string;
  /** Absolute path to DOM HTML */
  domPath: string;
  /** Absolute path to meta.json */
  metaPath: string;
  /** Structured observation (kind-specific) */
  meta: Record<string, unknown>;
}

/** Result of one interaction module. */
export interface InteractionResult {
  moduleName: string;
  ok: boolean;
  artifactsProduced: number;
  errors: string[];
  durationMs: number;
}

/** Page-level capture summary. */
export interface PageCapture {
  profile: PageProfile;
  artifacts: CaptureArtifact[];
  interactions: InteractionResult[];
  startedAt: string;
  finishedAt: string;
  totalDurationMs: number;
}

/** Output paths per route. */
export interface RouteOutputPaths {
  root: string;
  screenshots: string;
  doms: string;
  metas: string;
  /** `manifest.json` — list of all artifacts */
  manifest: string;
}
