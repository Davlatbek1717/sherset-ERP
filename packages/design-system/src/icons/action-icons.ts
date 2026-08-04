/**
 * Curated icon set for actions and navigation. Use these specific icons
 * per concept across the entire app — do not pick different lucide icons
 * ad-hoc. Adding a new icon? Add it here first, give it a stable key, and
 * reference `Icons.<key>` from feature code.
 *
 * Style: Lucide line icons at default 1.5px stroke. Render at 16-18 px
 * inside table cells/buttons, 20-24 px in nav rails, 28-32 px on landing
 * cards. Set `className="text-current"` so the icon inherits the text
 * color of its container — colour comes from the surrounding theme,
 * never hard-coded on the icon.
 */

import {
  AlertCircle,
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  Banknote,
  Bell,
  BellOff,
  Building2,
  Calendar,
  ChartBar,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronsLeft,
  ChevronsRight,
  CirclePlus,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Cog,
  Coins,
  Command,
  Copy,
  Download,
  DownloadCloud,
  Edit,
  ExternalLink,
  Eye,
  EyeOff,
  File,
  FileText,
  Filter,
  FolderKanban,
  Globe,
  Grid3x3,
  GripVertical,
  Handshake,
  Hash,
  HelpCircle,
  Inbox,
  Info,
  Key,
  Landmark,
  LifeBuoy,
  LineChart,
  Link2,
  ListTodo,
  Loader2,
  Mail,
  MapPin,
  Menu,
  MessageCircle,
  Moon,
  MoreHorizontal,
  MoreVertical,
  Package,
  Paperclip,
  Pencil,
  Percent,
  Phone,
  PiggyBank,
  Plus,
  Printer,
  Puzzle,
  QrCode,
  RefreshCw,
  Save,
  ScanBarcode,
  ScanLine,
  Search,
  Send,
  Settings,
  Share2,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Sliders,
  Sparkles,
  Store,
  Sun,
  Tag,
  Trash2,
  TrendingUp,
  Upload,
  UploadCloud,
  User,
  UserCog,
  Users,
  Wallet,
  Warehouse,
  Webhook,
  Wrench,
  X,
} from 'lucide-react';
import { RowDeleteCircle } from './RowDeleteCircle.tsx';

export const Icons = {
  // CRUD
  create: Plus,
  // moysklad-parity create-BUTTON icon: a circled plus (⊕), matching the
  // sprite on moysklad's «+ Document» toolbar buttons. (Menu-item create
  // icons keep the plain `create`/Plus.)
  createCircle: CirclePlus,
  edit: Pencil,
  editAlt: Edit,
  save: Save,
  delete: Trash2,
  // moysklad row-hover quick-delete: a FILLED grey disc + white cross (NOT a
  // lucide line icon — see RowDeleteCircle.tsx). Shown via DataTable's
  // `rowActions` slot, revealed on row hover, wired to a confirm + delete.
  rowDelete: RowDeleteCircle,
  archive: Archive,
  restore: ArchiveRestore,
  copy: Copy,

  // Navigation chrome
  back: ArrowLeft,
  forward: ArrowRight,
  up: ChevronUp,
  down: ChevronDown,
  left: ChevronLeft,
  right: ChevronRight,
  more: MoreHorizontal,
  moreVertical: MoreVertical,
  close: X,
  // Drag-to-reorder handle (⣿): the grip shown at a row's far left when the
  // row is hovered/focused, mirroring moysklad's pack/position reorder grip.
  grip: GripVertical,
  // Pager jump-to-first / jump-to-last (‹‹ / ››) — the double-chevron buttons in
  // moysklad's «‹‹ ‹ N-M из T › ››» embedded-table pager.
  pageFirst: ChevronsLeft,
  pageLast: ChevronsRight,

  // Search / filter
  search: Search,
  filter: Filter,

  // IO
  upload: Upload,
  paperclip: Paperclip,
  download: Download,
  print: Printer,
  send: Send,
  mail: Mail,
  share: Share2,
  link: Link2,

  // Status
  check: Check,
  loading: Loader2,
  refresh: RefreshCw,
  visible: Eye,
  hidden: EyeOff,

  // Module-level icons used in the AppShell top-bar (replace the previous
  // emoji set; one icon per module, mirrors the moysklad.uz line-icon
  // navigation style).
  homepage: LineChart,
  purchases: ShoppingBag,
  sales: ShoppingCart,
  goods: Package,
  crm: Users,
  stock: Warehouse,
  money: Wallet,
  reports: TrendingUp,
  retail: Store,
  ecom: Globe,
  production: Cog,
  tasks: CheckSquare,
  apps: Puzzle,
  hr: UserCog,
  analitika: ChartBar,
  // Menejer — kunlik KPI qabul qilish (TZ 4M.2). «Tekshirilgan ro'yxat»
  // metaforasi: menejerning ishi = kunlarni ko'rib chiqib yopish.
  menejer: ClipboardCheck,

  // Settings landing — one icon per admin domain card
  organizations: Building2,
  stores: Warehouse,
  cashDesks: Banknote,
  bankAccounts: Landmark,
  priceTypes: Tag,
  email: Mail,
  exchangeRates: ArrowLeftRight,
  mxik: Hash,
  auditLog: ListTodo,
  attributes: Sliders,
  webhooks: Webhook,
  uoms: Sliders,
  taxRates: ShieldCheck,
  expenseItems: ShoppingBag,
  projects: FolderKanban,
  customEntities: Grid3x3,
  regions: MapPin,
  trackingCodes: ScanLine,
  discounts: Percent,

  // Production landing
  bom: ClipboardList,
  workOrder: Wrench,

  // E-commerce landing
  channel: Link2,
  onlineOrder: Inbox,

  // Reports landing
  reportSales: TrendingUp,
  reportCashFlow: ArrowLeftRight,
  reportPnl: PiggyBank,
  reportStockBalance: Package,
  reportCpBalance: Handshake,

  // Generic entity icons (still used by reports, autocomplete, etc.)
  product: Package,
  cart: ShoppingCart,
  file: File,
  document: FileText,
  user: User,
  users: Users,
  settings: Settings,
  store: Store,
  coins: Coins,
  chart: ChartBar,
  grid: Grid3x3,

  // UX chrome — small but ubiquitous
  help: HelpCircle,
  helpAlt: LifeBuoy,
  notification: Bell,
  notificationOff: BellOff,
  info: Info,
  warning: AlertTriangle,
  error: AlertCircle,
  externalLink: ExternalLink,
  command: Command,
  menu: Menu,
  expand: ChevronsRight,

  // Theme
  themeLight: Sun,
  themeDark: Moon,

  // Time / scheduling
  calendar: Calendar,
  clock: Clock,

  // Auth / security
  key: Key,
  shield: ShieldCheck,

  // Communication
  phone: Phone,
  chat: MessageCircle,

  // Codes
  barcode: ScanBarcode,
  qrcode: QrCode,

  // IO clouds
  uploadCloud: UploadCloud,
  downloadCloud: DownloadCloud,

  // Marketing / nav extras
  sparkles: Sparkles,
} as const;

export type IconName = keyof typeof Icons;
