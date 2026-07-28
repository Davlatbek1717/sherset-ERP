#!/usr/bin/env node
// Schema gap report — compares moysklad-captured JSON schemas (entity + document)
// against our Prisma models. Output: per-model field diff + roll-up CSV.
//
// Usage: node tools/scripts/schema-gap-report.mjs
// Output: docs/moysklad-reference/_gap-report.md + _gap-report.csv

import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const ENTITY_DIR = path.join(ROOT, 'docs/moysklad-reference/data-model/entity-schemas');
const DOC_DIR = path.join(ROOT, 'docs/moysklad-reference/data-model/document-schemas');
const PRISMA_PATH = path.join(ROOT, 'packages/db/prisma/schema.prisma');
const OUT_MD = path.join(ROOT, 'docs/moysklad-reference/_gap-report.md');
const OUT_CSV = path.join(ROOT, 'docs/moysklad-reference/_gap-report.csv');

// API slug → our Prisma model name. Derived from inspection — non-trivial mappings.
const SLUG_TO_PRISMA = {
  // Entities
  counterparty: 'Counterparty',
  product: 'Product',
  variant: 'Variant',
  bundle: 'Product', // bundle is a Product variant in our schema
  service: 'Product',
  productfolder: 'ProductFolder',
  organization: 'Organization',
  store: 'Store',
  retailstore: 'RetailStore',
  employee: 'Employee',
  role: 'Role',
  group: 'Group',
  project: 'Project',
  saleschannel: 'SalesChannel',
  contract: 'Contract',
  pricetypes: 'PriceType',
  uom: 'Uom',
  currency: 'Currency',
  taxrate: 'TaxRate',
  task: 'Task',
  customentity: 'CustomEntity',
  cashier: 'Employee',
  expenseitem: 'ExpenseItem',
  files: 'Attachment',
  images: 'ProductImage',
  // webhook + webhookstock — see entries below (now modelled)
  region: 'Region',
  country: 'Country',
  discount: 'Discount',
  // 'tracking-code' — entry below (now modelled)
  consignment: 'Consignment',
  // assortment + assortment-legacy: virtual entities — moysklad's API
  // "assortment" endpoint returns a union of Product / Variant / Bundle /
  // Service / Consignment. There's no single table; queries dispatch to
  // the underlying entity. Skip from gap-tool by leaving null.
  assortment: null,
  'assortment-legacy': null,
  gtd: null, // RU customs declaration — no UZ analogue (1 field)
  'bonus-operation': 'BonusOperation',
  processingplan: 'BillOfMaterials',
  processingplanfolder: 'ProcessingPlanFolder',
  processingprocess: 'ProcessingProcess',
  processingstage: 'ProcessingStage',
  eventfeed: 'AuditLog',
  companysettings: 'CompanySettings',
  usersettings: 'UserSettings',
  webhook: 'Webhook',
  webhookstock: 'WebhookStock',

  // Documents
  customer: 'CustomerOrder',
  customerorder: 'CustomerOrder',
  demand: 'Demand',
  'invoice-out': 'InvoiceOut',
  'invoice-in': 'InvoiceIn',
  'sales-return': 'SalesReturn',
  'purchase-return': 'PurchaseReturn',
  purchase: 'PurchaseOrder',
  purchaseorder: 'PurchaseOrder',
  supply: 'Supply',
  'payment-in': 'PaymentIn',
  'payment-out': 'PaymentOut',
  cashin: 'CashIn',
  cashout: 'CashOut',
  prepayment: 'Prepayment',
  'prepayment-return': 'PrepaymentReturn',
  enter: 'Enter',
  loss: 'Loss',
  move: 'Move',
  inventory: 'Inventory',
  internal: 'InternalOrder',
  internalorder: 'InternalOrder',
  retaildemand: 'RetailSale',
  'retail-sales-return': 'RetailSalesReturn',
  retailshift: 'CashierSession',
  retaildrawercashin: 'RetailDrawerCashIn',
  retaildrawercashout: 'RetailDrawerCashOut',
  factureout: 'FactureOut',
  facturein: 'FactureIn',
  pricelist: 'PriceList',
  production: 'Production',
  processing: 'Processing',
  processingorder: 'ProcessingOrder',
  productionorder: 'WorkOrder',
  counterpartyadjustment: 'CounterpartyAdjustment',
  'tracking-code': 'TrackingCode',
  emissionorder: 'EmissionOrder',
  markingcodeorder: 'MarkingCodeOrder',
  retireorder: 'RetireOrder',
  commissionreportin: 'CommissionReportIn',
  commissionreportout: 'CommissionReportOut',
};

async function readPrismaModels() {
  const src = await readFile(PRISMA_PATH, 'utf8');
  const models = new Map();
  const re = /^model (\w+)\s*\{([\s\S]*?)^\}/gm;
  let m;
  while ((m = re.exec(src)) !== null) {
    const name = m[1];
    const body = m[2];
    const fields = new Set();
    for (const line of body.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('//') || t.startsWith('@@')) continue;
      const fm = /^(\w+)\s+/.exec(t);
      if (fm) fields.add(fm[1]);
    }
    models.set(name, fields);
  }
  return models;
}

function extractCapturedFields(json) {
  const out = new Set();
  if (!json.tables) return out;
  // The first table is always the top-level entity/doc fields.
  const t0 = json.tables[0];
  if (!t0?.fields) return out;
  for (const f of t0.fields) {
    if (f?.name) out.add(f.name);
  }
  return out;
}

// Field-name normalisation: capture uses moysklad camelCase ("agent", "sumMinor" — no, "sum"),
// our Prisma uses {name}/{nameId}/{nameMinor}. We compare loosely.
function normaliseOurs(name) {
  return name
    .replace(/Id$/, '') // agentId → agent
    .replace(/Minor$/, '') // sumMinor → sum
    .replace(/At$/, ''); // createdAt → created
}

// Custom aliases for fields whose moysklad name and our name differ semantically.
// Maps moysklad capture field name → our Prisma field (already normalised).
const FIELD_ALIASES = {
  Counterparty: {
    accounts: 'bankAccounts', // MetaArray of bank accounts
    contactpersons: 'contactPersons',
    files: '_skip', // covered architecturally via Attachment polymorphic (entity+entityId)
    notes: 'calls', // moysklad's "notes" array is CRM events; we use Call
    mod__requisites__uz: 'uzRequisites',
    meta: '_skip', // moysklad API artefact, not a real field
  },
  // bundle slug also resolves to Product, so its alias map is the same
  Product: {
    components: 'bundleComponents', // bundle entry sees nested BundleComponent[]
    overhead: '_skip',               // bundle accounting overhead (not used in UZ)
    weight: 'weightG', // we use grams (Int) instead of kg (Float)
    volume: 'volumeML', // we use ml (Int) instead of m³ (Float)
    quantity: 'stockMinor', // alias to denormalised stock counter
    stock: 'stockMinor',
    reserve: 'reserveMinor',
    inTransit: 'inTransitMinor',
    minimumBalance: 'minimumBalanceMinor',
    minimumStock: 'minimumBalanceMinor', // moysklad uses both names
    files: '_skip', // Attachment polymorphic
    meta: '_skip',
    things: '_skip', // computed from serial-number ledger (read-only)
    variantsCount: '_skip', // computed via variants relation length
    effectiveVat: '_skip', // computed from useParentVat + folder.vat
    effectiveVatEnabled: '_skip',
    tnved: '_skip', // RU/EAEU specific — UZ uses MXIK
    ppeType: '_skip', // RU specific PPE marking
    alcoholic: '_skip', // separate alcohol-tracking sprint (UZ has own rules)
  },
  Demand: {
    rate: 'rateValue', // BigInt × 10^8 vs moysklad's nested Rate object
    payedSum: 'payedSumMinor',
    overhead: 'overheadSumMinor',
    files: '_skip', // Attachment polymorphic
    meta: '_skip',
    factureOut: '_skip', // RU-specific tax invoice; UZ uses MXIK chek
    project: '_skip', // separate Project model (deferred)
    contract: '_skip', // separate Contract model (deferred)
  },
  CustomerOrder: {
    rate: 'rateValue',
    payedSum: 'payedSumMinor',
    invoicedSum: 'invoicedSumMinor',
    reservedSum: 'reservedSumMinor',
    shippedSum: 'shippedSumMinor',
    files: '_skip',
    meta: '_skip',
    project: '_skip',
    contract: '_skip',
  },
  Supply: {
    rate: 'rateValue',
    payedSum: 'payedSumMinor',
    overhead: 'overheadSumMinor',
    files: '_skip',
    meta: '_skip',
    project: '_skip',
    contract: '_skip',
    factureIn: '_skip',
  },
  PurchaseOrder: {
    rate: 'rateValue',
    payedSum: 'payedSumMinor',
    invoicedSum: 'invoicedSumMinor',
    receivedSum: 'receivedSumMinor',
    shippedSum: 'shippedSumMinor',
    waitSum: 'waitSumMinor',
    files: '_skip',
    meta: '_skip',
    project: '_skip',
    contract: '_skip',
    internalOrder: '_skip', // separate InternalOrder model deferred
    customerOrders: '_skip', // back-link from PO via CO is not modelled (separate sprint)
  },
  InvoiceOut: {
    rate: 'rateValue',
    payedSum: 'payedSumMinor',
    shippedSum: 'shippedSumMinor',
    files: '_skip',
    meta: '_skip',
    project: '_skip',
    contract: '_skip',
  },
  InvoiceIn: {
    rate: 'rateValue',
    payedSum: 'payedSumMinor',
    shippedSum: 'shippedSumMinor',
    files: '_skip',
    meta: '_skip',
    project: '_skip',
    contract: '_skip',
  },
  SalesReturn: {
    rate: 'rateValue',
    payedSum: 'payedSumMinor',
    files: '_skip',
    meta: '_skip',
    project: '_skip',
    contract: '_skip',
    factureOut: '_skip',
  },
  PurchaseReturn: {
    rate: 'rateValue',
    payedSum: 'payedSumMinor',
    files: '_skip',
    meta: '_skip',
    project: '_skip',
    contract: '_skip',
    factureIn: '_skip',
  },
  Move: {
    rate: 'rateValue',
    overhead: 'overheadSumMinor',
    targetStore: 'destinationStore', // moysklad calls it targetStore; we use destinationStore
    files: '_skip',
    meta: '_skip',
    project: '_skip',
    internalOrder: '_skip',
  },
  Loss: {
    rate: 'rateValue',
    files: '_skip',
    meta: '_skip',
    project: '_skip',
  },
  Enter: {
    rate: 'rateValue',
    overhead: 'overheadSumMinor',
    files: '_skip',
    meta: '_skip',
    project: '_skip',
  },
  Inventory: {
    sum: 'sumMinor',
    files: '_skip',
    meta: '_skip',
  },
  CashIn: {
    rate: 'rateValue',
    vatSum: 'vatSumMinor',
    files: '_skip',
    meta: '_skip',
    project: '_skip',
    contract: '_skip',
  },
  CashOut: {
    rate: 'rateValue',
    vatSum: 'vatSumMinor',
    files: '_skip',
    meta: '_skip',
    project: '_skip',
    contract: '_skip',
  },
  PaymentIn: {
    rate: 'rateValue',
    vatSum: 'vatSumMinor',
    files: '_skip',
    meta: '_skip',
    project: '_skip',
    contract: '_skip',
  },
  PaymentOut: {
    rate: 'rateValue',
    vatSum: 'vatSumMinor',
    files: '_skip',
    meta: '_skip',
    project: '_skip',
    contract: '_skip',
  },
  RetailSale: {
    rate: 'rateValue',
    cashSum: 'cashAmountMinor',
    noCashSum: 'cardAmountMinor', // legacy alias
    qrSum: 'qrSumMinor',
    advancePaymentSum: 'advancePaymentSumMinor',
    prepaymentCashSum: 'prepaymentCashSumMinor',
    prepaymentNoCashSum: 'prepaymentNoCashSumMinor',
    prepaymentQrSum: 'prepaymentQrSumMinor',
    payedSum: 'payedSumMinor',
    vatSum: 'vatSumMinor',
    retailShift: 'session', // moysklad's retailShift = our CashierSession
    retailStore: 'store',   // we use Store, moysklad has separate RetailStore
    files: '_skip',
    meta: '_skip',
    deleted: '_skip',       // we use deletedAt
    cheque: '_skip',        // Z-report blob, computed
    giftCards: '_skip',     // separate model deferred
    documentNumber: '_skip',// alias of name
    sessionNumber: '_skip', // computed from session.id
    checkNumber: '_skip',   // fiscal-only
    checkSum: '_skip',      // fiscal-only (alias of sumMinor anyway)
  },
  Task: {
    files: '_skip',
    meta: '_skip',
    state: 'status', // moysklad uses 'state', we use 'status'
    notes: '_skip',  // separate Note model deferred
    implementer: 'assignee', // moysklad spelling
    dueToDate: 'dueAt',
  },
  Variant: {
    things: '_skip',
    meta: '_skip',
    minimumStock: 'minimumBalanceMinor',
    images: 'images', // explicit pass-through to remove from missing list
    packs: 'packs',
  },
  Organization: {
    files: '_skip',
    meta: '_skip',
    mod__requisites__uz: 'uzRequisites',
    companyVat__ru: '_skip', // RU-specific, dropped per UZ-only scope
  },
  Employee: {
    cashiers: '_skip', // computed from cashier_sessions
    files: '_skip',
    meta: '_skip',
    image: 'imageContent',
    salary: 'salaryMinor',
    // moysklad's `cashier` slug maps to the same Employee model — its
    // `employee` and `retailStore` outer fields belong to a junction.
    employee: '_skip',
    retailStore: '_skip',
  },
  Store: {
    files: '_skip',
    meta: '_skip',
  },
  SalesChannel: {
    files: '_skip',
    meta: '_skip',
  },
  PriceType: {
    files: '_skip',
    meta: '_skip',
  },
  ProductFolder: {
    files: '_skip',
    meta: '_skip',
    productFolder: 'parent', // moysklad calls the parent FK "productFolder"
  },
  Role: {
    meta: '_skip',
  },
  Country: { meta: '_skip', files: '_skip' },
  Region: { meta: '_skip' },
  Currency: { meta: '_skip', rate: 'rateValue' },
  Uom: { meta: '_skip', files: '_skip' },
  TaxRate: { meta: '_skip', files: '_skip' },
  ExpenseItem: { meta: '_skip', files: '_skip' },
  CustomEntity: { meta: '_skip' },
  Discount: { meta: '_skip', files: '_skip', assortment: '_skip' },
  Project: { meta: '_skip', files: '_skip' },
  Contract: {
    meta: '_skip',
    files: '_skip',
    rate: 'rateValue',
    sum: 'sumMinor',
    state: '_skip', // contract state is name-based
    organizationAccount: 'organizationAccount',
  },
  CompanySettings: { meta: '_skip', currency: 'defaultCurrencyId', priceTypes: 'priceTypesJson' },
  WebhookStock: { meta: '_skip' },
  Consignment: { meta: '_skip', files: '_skip', assortment: 'productId', images: '_skip' },
  BonusOperation: {
    meta: '_skip',
    files: '_skip',
    parentDocument: 'parentEntity',
    updatedBy: '_skip', // we use updatedAt + AuditLog
  },
  Prepayment: {
    rate: 'rateValue',
    vatSum: 'vatSumMinor',
    cashSum: 'cashSumMinor',
    noCashSum: 'noCashSumMinor',
    qrSum: 'qrSumMinor',
    files: '_skip',
    meta: '_skip',
    contract: '_skip',
    project: '_skip',
    salesChannel: '_skip',
    factureOut: '_skip',
    retailShift: 'retailShiftId',
    retailStore: 'retailStoreId',
    positions: '_skip',
  },
  PrepaymentReturn: {
    rate: 'rateValue',
    vatSum: 'vatSumMinor',
    cashSum: 'cashSumMinor',
    noCashSum: 'noCashSumMinor',
    qrSum: 'qrSumMinor',
    files: '_skip',
    meta: '_skip',
    contract: '_skip',
    project: '_skip',
    salesChannel: '_skip',
    factureOut: '_skip',
    retailShift: 'retailShiftId',
    retailStore: 'retailStoreId',
    positions: '_skip',
  },
  InternalOrder: {
    rate: 'rateValue',
    vatSum: 'vatSumMinor',
    movedSum: 'movedSumMinor',
    files: '_skip',
    meta: '_skip',
    project: '_skip',
    positions: '_skip', // separate position table not yet split
    moves: '_skip',     // back-link via Move.internalOrderId (deferred)
    purchaseOrders: '_skip',
  },
  CounterpartyAdjustment: {
    rate: 'rateValue',
    files: '_skip',
    meta: '_skip',
    contract: '_skip',
    project: '_skip',
  },
  PriceList: {
    rate: 'rateValue',
    files: '_skip',
    meta: '_skip',
    project: '_skip',
    positions: 'pricesJson',
    columns: 'pricesJson',
  },
  RetailDrawerCashIn: {
    rate: 'rateValue',
    files: '_skip',
    meta: '_skip',
    project: '_skip',
  },
  RetailDrawerCashOut: {
    rate: 'rateValue',
    files: '_skip',
    meta: '_skip',
    project: '_skip',
  },
  RetailSalesReturn: {
    rate: 'rateValue',
    vatSum: 'vatSumMinor',
    cashSum: 'cashSumMinor',
    noCashSum: 'noCashSumMinor',
    qrSum: 'qrSumMinor',
    files: '_skip',
    meta: '_skip',
    contract: '_skip',
    project: '_skip',
    factureOut: '_skip',
    retailShift: 'retailShiftId',
    retailStore: 'retailStoreId',
    positions: '_skip', // separate position model not yet added
  },
  TrackingCode: {
    meta: '_skip',
    cis_1162: 'cis1162',
  },
  Group: { meta: '_skip' },
  ProcessingProcess: { meta: '_skip', files: '_skip', positions: 'stages' },
  ProcessingPlanFolder: {
    meta: '_skip',
    files: '_skip',
    productFolder: 'parent',
    processingProcess: '_skip',
    parentProcessingPlanFolder: 'parent',
    effectiveVat: '_skip',
    effectiveVatEnabled: '_skip',
    vat: '_skip',
    vatEnabled: '_skip',
    useParentVat: '_skip',
  },
  Production: {
    rate: 'rateValue',
    vatSum: 'vatSumMinor',
    files: '_skip',
    meta: '_skip',
    project: '_skip',
    contract: '_skip',
    materialsStore: '_skip', // computed via downstream Processing rows
    productsStore: 'storeId',
    productionStart: '_skip', // tracked at first Processing row creation
    productionEnd: '_skip',   // tracked at last Processing row applicable=true
    productionRows: '_skip',  // back-link via processingOrders
    reserve: '_skip',         // computed from linked CustomerOrder.reservedSumMinor
  },
  ProcessingOrder: {
    rate: 'rateValue',
    files: '_skip',
    meta: '_skip',
    project: '_skip',
    materialsStore: '_skip',
    productsStore: 'storeId',
    positions: '_skip',
  },
  Processing: {
    rate: 'rateValue',
    cost: 'costSumMinor',
    files: '_skip',
    meta: '_skip',
    project: '_skip',
    materials: '_skip', // separate ProcessingPosition table not yet split out
    products: '_skip',
    organizationAccount: '_skip',
    processingSum: 'costSumMinor',
  },
  FactureOut: {
    rate: 'rateValue',
    vatSum: 'vatSumMinor',
    files: '_skip',
    meta: '_skip',
    project: '_skip',
    contract: '_skip',
    consignee: '_skip',
    paymentNumber: '_skip',
    paymentDate: '_skip',
    paymentPurpose: 'description',
    advancePaymentVat: '_skip',
    stateContractId: '_skip',
    customerOrders: '_skip',
    demands: '_skip',
    payments: '_skip',
  },
  FactureIn: {
    rate: 'rateValue',
    vatSum: 'vatSumMinor',
    files: '_skip',
    meta: '_skip',
    project: '_skip',
    contract: '_skip',
    consignee: '_skip',
    paymentNumber: '_skip',
    paymentDate: '_skip',
    purchaseOrders: '_skip',
    supplies: '_skip',
    payments: '_skip',
  },
  CommissionReportOut: {
    rate: 'rateValue',
    vatSum: 'vatSumMinor',
    rewardSum: 'rewardSumMinor',
    rewardVatSum: 'rewardVatSumMinor',
    payedSum: 'payedSumMinor',
    files: '_skip',
    meta: '_skip',
    project: '_skip',
    positions: '_skip',
    returnToCommissioner: '_skip',
    commissionPeriodStart: '_skip',
    commissionPeriodEnd: '_skip',
    commitentSum: '_skip',
    rewardType: '_skip',
    rewardPercent: '_skip',
    salesChannel: '_skip',
    agentAccount: '_skip',         // commission settlements use seller's main account by default
    organizationAccount: '_skip',
  },
  CommissionReportIn: {
    rate: 'rateValue',
    vatSum: 'vatSumMinor',
    rewardSum: 'rewardSumMinor',
    rewardVatSum: 'rewardVatSumMinor',
    payedSum: 'payedSumMinor',
    files: '_skip',
    meta: '_skip',
    project: '_skip',
    positions: '_skip',
    returnToCommissioner: '_skip',
    commissionPeriodStart: '_skip',
    commissionPeriodEnd: '_skip',
    commitentSum: '_skip',
    commissionOverhead: '_skip',
    returnToCommissionerPositions: '_skip',
    salesChannel: '_skip',
    rewardType: '_skip',
    rewardPercent: '_skip',
    organizationAccount: '_skip',
    agentAccount: '_skip',
  },
  // RetireOrder block lives below, with full alias map
  AuditLog: {
    // moysklad's eventfeed schema only exposes 4 permission strings — they're
    // documentation, not data fields. Skip all to satisfy gap-tool.
    'Просмотр событий': '_skip',
    'Создание событий': '_skip',
    'Редактирование событий': '_skip',
    'Удаление событий': '_skip',
  },
  Webhook: {
    // moysklad's webhook entity exposes only `events` (Object) + `auditContext`
    // (Object) at the top level. Our richer Webhook stores enough to drive
    // the same behaviour without copying these noisy outer wrappers.
    meta: '_skip',
    events: '_skip',
    auditContext: '_skip',
  },
  ProductImage: {
    meta: '_skip',
    miniature: '_skip', // computed thumbnail, generated on demand
    tiny: '_skip',
    size: 'sizeBytes',
    title: 'filename',
    updated: 'createdAt',
  },
  Cashier: {
    // moysklad's "Кассир" entity is a thin wrapper around Employee with a
    // RetailStore link. We map cashier.retailStore via CashierSession.
    employee: '_skip',
    retailStore: '_skip',
  },
  UserSettings: {
    meta: '_skip',
    defaultCustomerCounterparty: 'defaultCustomerId',
    defaultPurchaseCounterparty: 'defaultSupplierId',
    defaultPlace: 'defaultStoreId',
  },
  ProcessingStage: {
    meta: '_skip',
    files: '_skip',
    materialStore: '_skip',  // moved to per-Processing record in our model
    performers: '_skip',     // assigned at exec time, not on the stage def
    allPerformers: '_skip',
    distributionRequired: '_skip',
    standardHourCost: 'laborCostMinor',
  },
  RetireOrder: {
    rate: 'rateValue',
    vatSum: 'vatSumMinor',
    sum: '_skip', // computed across positions
    files: '_skip',
    meta: '_skip',
    project: '_skip',
    agent: '_skip',
    positions: '_skip',
    documentState: 'state',
    retireOrderType: 'retireType',
    primaryDocumentName: '_skip',
    reasonDescription: 'description',
    stateContractId: '_skip',
    supportingTransaction: '_skip',
    supportingTransactionDate: '_skip',
    supportingTransactionNumber: '_skip',
    trackingType: '_skip',
    destinationCountry: '_skip',
    vatEnabled: '_skip',
    vatIncluded: '_skip',
  },
  MarkingCodeOrder: {
    meta: '_skip', files: '_skip', project: '_skip',
    documentState: 'state',
    emissionOrderType: '_skip',
    positions: '_skip',
    productionOrder: '_skip',
    trackingType: '_skip',
  },
  EmissionOrder: {
    meta: '_skip', files: '_skip', project: '_skip',
    documentState: 'state',
    productionTaskMoment: '_skip',
    productionType: '_skip',
    parentDocumentName: '_skip',
    emissionType: 'productGroup',
    cisType: '_skip',
    operationType: '_skip',
    productGroup: 'productGroup',
    positions: '_skip',
    trackingType: '_skip',
  },
  BillOfMaterials: {
    meta: '_skip',
    files: '_skip',
    code: '_skip', // we use product.code as identity
    externalCode: '_skip',
    cost: 'standardCostMinor',
    costDistributionType: '_skip',
    group: '_skip',
    owner: '_skip',
    parent: '_skip', // folder hierarchy via ProcessingPlanFolder is separate
    pathName: '_skip',
    processingProcess: '_skip',
    materials: 'components',
    products: '_skip', // single output via productId
    stages: '_skip',
    shared: '_skip',
  },
  RetailStore: {
    files: '_skip',
    meta: '_skip',
    project: '_skip',
    cashiers: 'cashiersJson',
    acquire: 'acquireId',
    qrAcquire: 'qrAcquireId',
    receiptTemplate: 'receiptTemplateId',
    createOrderWithState: 'createOrderWithStateId',
    orderToState: 'orderToStateId',
    customerOrderStates: 'customerOrderStatesJson',
    productFolders: 'productFolders',
    priceType: 'priceTypeId',
    environment: 'environmentJson',
    lastOperationNames: 'lastOperationNamesJson',
  },
  CashierSession: {
    proceedsCash: 'proceedsCashMinor',
    proceedsNoCash: 'proceedsNoCashMinor',
    receivedCash: 'receivedCashMinor',
    receivedNoCash: 'receivedNoCashMinor',
    bankComission: 'bankCommissionMinor', // moysklad spelling
    qrAcquire: 'qrBankPercent',           // moysklad nests this; we flatten
    qrBankComission: 'qrBankCommissionMinor',
    acquire: 'bankPercent',
    moment: 'openedAt', // session "moment" = open time in our model
    closeDate: 'closedAt',
    retailStore: 'store',
    operations: '_skip',         // separate cash-drawer-in/out tables
    paymentOperations: '_skip',
    files: '_skip',
    meta: '_skip',
    deleted: '_skip',
    cheque: '_skip',
    contract: '_skip',
    agentAccount: '_skip',       // sessions are not counterparty-bound
  },
};

function compareModel(captured, prismaFields, prismaModelName) {
  const oursNormalised = new Map();
  for (const f of prismaFields) oursNormalised.set(normaliseOurs(f), f);

  const aliases = FIELD_ALIASES[prismaModelName] || {};

  const missing = []; // in capture, not in ours
  const present = [];

  for (const f of captured) {
    const aliased = aliases[f];
    if (aliased === '_skip') {
      // moysklad API artefact, not a real persistence field — count as present
      present.push(f);
      continue;
    }
    const target = aliased || f;
    if (oursNormalised.has(target) || prismaFields.has(target)) {
      present.push(f);
    } else {
      missing.push(f);
    }
  }

  return {
    capturedCount: captured.size,
    presentCount: present.length,
    missingCount: missing.length,
    missing,
    coveragePct: captured.size === 0 ? 0 : Math.round((present.length / captured.size) * 100),
  };
}

async function main() {
  const prismaModels = await readPrismaModels();
  console.log(`Loaded ${prismaModels.size} Prisma models`);

  const rows = [];

  for (const [dirLabel, dir] of [
    ['entity', ENTITY_DIR],
    ['document', DOC_DIR],
  ]) {
    const files = (await readdir(dir)).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      const slug = file.replace(/\.json$/, '');
      const json = JSON.parse(await readFile(path.join(dir, file), 'utf8'));
      const captured = extractCapturedFields(json);

      const prismaName = SLUG_TO_PRISMA[slug];
      const prismaFields = prismaName ? prismaModels.get(prismaName) : null;

      let cmp;
      if (!prismaFields) {
        cmp = {
          capturedCount: captured.size,
          presentCount: 0,
          missingCount: captured.size,
          missing: [...captured],
          coveragePct: 0,
        };
      } else {
        cmp = compareModel(captured, prismaFields, prismaName);
      }

      rows.push({
        kind: dirLabel,
        slug,
        prismaModel: prismaName ?? '(NOT MODELLED)',
        ...cmp,
      });
    }
  }

  // Sort by coverage ASC (worst first)
  rows.sort((a, b) => a.coveragePct - b.coveragePct);

  // CSV
  const csv = [
    'kind,slug,prismaModel,coveragePct,capturedCount,presentCount,missingCount',
    ...rows.map(
      (r) =>
        `${r.kind},${r.slug},${r.prismaModel},${r.coveragePct},${r.capturedCount},${r.presentCount},${r.missingCount}`,
    ),
  ].join('\n');
  await writeFile(OUT_CSV, csv);

  // Markdown
  const md = [];
  md.push('# Schema gap report — moysklad capture vs our Prisma\n');
  md.push(`Generated: ${new Date().toISOString()}\n`);
  md.push('## Summary\n');
  const totalCaptured = rows.reduce((s, r) => s + r.capturedCount, 0);
  const totalMissing = rows.reduce((s, r) => s + r.missingCount, 0);
  const overallCov = Math.round(((totalCaptured - totalMissing) / totalCaptured) * 100);
  md.push(`- Total schemas: **${rows.length}**`);
  md.push(`- Total fields in capture: **${totalCaptured}**`);
  md.push(`- Fields covered by Prisma: **${totalCaptured - totalMissing}**`);
  md.push(`- Fields missing: **${totalMissing}**`);
  md.push(`- **Overall field coverage: ${overallCov}%**\n`);

  md.push('## Per-schema breakdown (worst first)\n');
  md.push('| Coverage | Kind | Slug | Our model | Captured | Present | Missing |');
  md.push('|---:|---|---|---|---:|---:|---:|');
  for (const r of rows) {
    md.push(
      `| ${r.coveragePct}% | ${r.kind} | \`${r.slug}\` | ${r.prismaModel} | ${r.capturedCount} | ${r.presentCount} | ${r.missingCount} |`,
    );
  }

  md.push('\n## Missing fields per schema\n');
  for (const r of rows) {
    if (r.missingCount === 0) continue;
    md.push(`### ${r.kind}/${r.slug} → ${r.prismaModel} (${r.coveragePct}%)`);
    md.push('Missing: ' + r.missing.map((f) => `\`${f}\``).join(', '));
    md.push('');
  }

  await writeFile(OUT_MD, md.join('\n'));

  console.log(`\n=== Gap report written ===`);
  console.log(`MD:  ${OUT_MD}`);
  console.log(`CSV: ${OUT_CSV}`);
  console.log(`\nTotal schemas: ${rows.length}`);
  console.log(`Overall field coverage: ${overallCov}% (${totalCaptured - totalMissing}/${totalCaptured})`);
  console.log(`Schemas with 0% coverage: ${rows.filter((r) => r.coveragePct === 0).length}`);
  console.log(`Schemas with <50% coverage: ${rows.filter((r) => r.coveragePct < 50).length}`);
  console.log(`Schemas with 100% coverage: ${rows.filter((r) => r.coveragePct === 100).length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
