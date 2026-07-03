
Object.defineProperty(exports, "__esModule", { value: true });

const {
  Decimal,
  objectEnumValues,
  makeStrictEnum,
  Public,
  getRuntime,
  skip
} = require('./runtime/index-browser.js')


const Prisma = {}

exports.Prisma = Prisma
exports.$Enums = {}

/**
 * Prisma Client JS version: 5.22.0
 * Query Engine version: 605197351a3c8bdd595af2d2a9bc3025bca48ea2
 */
Prisma.prismaVersion = {
  client: "5.22.0",
  engine: "605197351a3c8bdd595af2d2a9bc3025bca48ea2"
}

Prisma.PrismaClientKnownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientKnownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)};
Prisma.PrismaClientUnknownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientUnknownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientRustPanicError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientRustPanicError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientInitializationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientInitializationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientValidationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientValidationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.NotFoundError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`NotFoundError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.Decimal = Decimal

/**
 * Re-export of sql-template-tag
 */
Prisma.sql = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`sqltag is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.empty = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`empty is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.join = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`join is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.raw = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`raw is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.validator = Public.validator

/**
* Extensions
*/
Prisma.getExtensionContext = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.getExtensionContext is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.defineExtension = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.defineExtension is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}

/**
 * Shorthand utilities for JSON filtering
 */
Prisma.DbNull = objectEnumValues.instances.DbNull
Prisma.JsonNull = objectEnumValues.instances.JsonNull
Prisma.AnyNull = objectEnumValues.instances.AnyNull

Prisma.NullTypes = {
  DbNull: objectEnumValues.classes.DbNull,
  JsonNull: objectEnumValues.classes.JsonNull,
  AnyNull: objectEnumValues.classes.AnyNull
}



/**
 * Enums
 */

exports.Prisma.TransactionIsolationLevel = makeStrictEnum({
  ReadUncommitted: 'ReadUncommitted',
  ReadCommitted: 'ReadCommitted',
  RepeatableRead: 'RepeatableRead',
  Serializable: 'Serializable'
});

exports.Prisma.AccountScalarFieldEnum = {
  id: 'id',
  name: 'name',
  country: 'country',
  currency: 'currency',
  locale: 'locale',
  timezone: 'timezone',
  plan: 'plan',
  recordScopeEnforced: 'recordScopeEnforced',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.DocumentSequenceScalarFieldEnum = {
  accountId: 'accountId',
  key: 'key',
  value: 'value',
  updatedAt: 'updatedAt'
};

exports.Prisma.EmployeeScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  ownerId: 'ownerId',
  email: 'email',
  passwordHash: 'passwordHash',
  name: 'name',
  firstName: 'firstName',
  lastName: 'lastName',
  middleName: 'middleName',
  fullName: 'fullName',
  shortFio: 'shortFio',
  position: 'position',
  phone: 'phone',
  inn: 'inn',
  salaryMinor: 'salaryMinor',
  salaryCurrency: 'salaryCurrency',
  imageContent: 'imageContent',
  imageMime: 'imageMime',
  description: 'description',
  externalCode: 'externalCode',
  uid: 'uid',
  shared: 'shared',
  attributes: 'attributes',
  groupId: 'groupId',
  lastLoginAt: 'lastLoginAt',
  failedLoginAttempts: 'failedLoginAttempts',
  lockedUntil: 'lockedUntil',
  archived: 'archived',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  version: 'version',
  username: 'username',
  isChecker: 'isChecker',
  telegramPhone: 'telegramPhone',
  moyskladAgentId: 'moyskladAgentId',
  department: 'department',
  hrRoles: 'hrRoles',
  salaryConfig: 'salaryConfig'
};

exports.Prisma.RoleScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  name: 'name',
  description: 'description',
  isSystem: 'isSystem',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  version: 'version'
};

exports.Prisma.RolePermissionScalarFieldEnum = {
  roleId: 'roleId',
  entity: 'entity',
  action: 'action',
  scope: 'scope'
};

exports.Prisma.EmployeeRoleScalarFieldEnum = {
  employeeId: 'employeeId',
  roleId: 'roleId',
  assignedAt: 'assignedAt'
};

exports.Prisma.RefreshTokenScalarFieldEnum = {
  id: 'id',
  employeeId: 'employeeId',
  tokenHash: 'tokenHash',
  userAgent: 'userAgent',
  ipAddress: 'ipAddress',
  expiresAt: 'expiresAt',
  revokedAt: 'revokedAt',
  familyId: 'familyId',
  replacedById: 'replacedById',
  createdAt: 'createdAt'
};

exports.Prisma.ApiTokenScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  employeeId: 'employeeId',
  tokenHash: 'tokenHash',
  name: 'name',
  scopes: 'scopes',
  expiresAt: 'expiresAt',
  revokedAt: 'revokedAt',
  lastUsedAt: 'lastUsedAt',
  ipAddress: 'ipAddress',
  createdAt: 'createdAt'
};

exports.Prisma.OrganizationScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  ownerId: 'ownerId',
  groupId: 'groupId',
  name: 'name',
  legalTitle: 'legalTitle',
  legalAddress: 'legalAddress',
  legalAddressFull: 'legalAddressFull',
  actualAddress: 'actualAddress',
  actualAddressFull: 'actualAddressFull',
  companyType: 'companyType',
  email: 'email',
  phone: 'phone',
  director: 'director',
  directorPosition: 'directorPosition',
  chiefAccountant: 'chiefAccountant',
  payerVat: 'payerVat',
  uzRequisites: 'uzRequisites',
  code: 'code',
  externalCode: 'externalCode',
  syncId: 'syncId',
  description: 'description',
  shared: 'shared',
  bonusPoints: 'bonusPoints',
  bonusProgramId: 'bonusProgramId',
  isEgaisEnable: 'isEgaisEnable',
  trackingContractDate: 'trackingContractDate',
  trackingContractNumber: 'trackingContractNumber',
  archived: 'archived',
  createdAt: 'createdAt',
  version: 'version',
  updatedAt: 'updatedAt'
};

exports.Prisma.StoreScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  ownerId: 'ownerId',
  groupId: 'groupId',
  parentId: 'parentId',
  name: 'name',
  code: 'code',
  externalCode: 'externalCode',
  description: 'description',
  address: 'address',
  addressFull: 'addressFull',
  pathName: 'pathName',
  zones: 'zones',
  slots: 'slots',
  shared: 'shared',
  attributes: 'attributes',
  allowNegativeStock: 'allowNegativeStock',
  isForward: 'isForward',
  archived: 'archived',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  version: 'version'
};

exports.Prisma.OrganizationAccountScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  organizationId: 'organizationId',
  name: 'name',
  isDefault: 'isDefault',
  currency: 'currency',
  bankName: 'bankName',
  bankLocation: 'bankLocation',
  accountNumber: 'accountNumber',
  correspondentAccount: 'correspondentAccount',
  bic: 'bic',
  balanceMinor: 'balanceMinor',
  archived: 'archived',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  version: 'version'
};

exports.Prisma.CashDeskScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  name: 'name',
  currency: 'currency',
  balanceMinor: 'balanceMinor',
  archived: 'archived',
  createdAt: 'createdAt',
  version: 'version',
  updatedAt: 'updatedAt'
};

exports.Prisma.ShiftScheduleScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  name: 'name',
  startTime: 'startTime',
  endTime: 'endTime',
  archived: 'archived',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SmenaScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  name: 'name',
  scheduleId: 'scheduleId',
  organizationId: 'organizationId',
  archived: 'archived',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SmenaEmployeeScalarFieldEnum = {
  smenaId: 'smenaId',
  employeeId: 'employeeId'
};

exports.Prisma.MoneyOperationScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  at: 'at',
  organizationAccountId: 'organizationAccountId',
  cashDeskId: 'cashDeskId',
  deltaMinor: 'deltaMinor',
  currency: 'currency',
  documentKind: 'documentKind',
  documentId: 'documentId',
  counterpartyId: 'counterpartyId',
  description: 'description'
};

exports.Prisma.BankStatementScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  uploadedBy: 'uploadedBy',
  organizationAccountId: 'organizationAccountId',
  filename: 'filename',
  format: 'format',
  rowCountTotal: 'rowCountTotal',
  rowCountMatched: 'rowCountMatched',
  rowCountImported: 'rowCountImported',
  state: 'state',
  notes: 'notes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.BankStatementRowScalarFieldEnum = {
  id: 'id',
  statementId: 'statementId',
  accountId: 'accountId',
  lineNumber: 'lineNumber',
  direction: 'direction',
  moment: 'moment',
  amountMinor: 'amountMinor',
  currency: 'currency',
  counterpartyName: 'counterpartyName',
  counterpartyInn: 'counterpartyInn',
  counterpartyAccount: 'counterpartyAccount',
  paymentPurpose: 'paymentPurpose',
  documentNumber: 'documentNumber',
  matchedCounterpartyId: 'matchedCounterpartyId',
  matchReason: 'matchReason',
  paymentInId: 'paymentInId',
  paymentOutId: 'paymentOutId',
  skipped: 'skipped',
  error: 'error'
};

exports.Prisma.CounterpartyBalanceScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  counterpartyId: 'counterpartyId',
  currency: 'currency',
  balanceMinor: 'balanceMinor',
  updatedAt: 'updatedAt'
};

exports.Prisma.CashInScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  ownerId: 'ownerId',
  groupId: 'groupId',
  name: 'name',
  code: 'code',
  externalCode: 'externalCode',
  syncId: 'syncId',
  agentId: 'agentId',
  organizationId: 'organizationId',
  cashDeskId: 'cashDeskId',
  salesChannelId: 'salesChannelId',
  contractId: 'contractId',
  projectId: 'projectId',
  moment: 'moment',
  applicable: 'applicable',
  state: 'state',
  postedAt: 'postedAt',
  sumMinor: 'sumMinor',
  vatSumMinor: 'vatSumMinor',
  currency: 'currency',
  rateValue: 'rateValue',
  paymentPurpose: 'paymentPurpose',
  description: 'description',
  shared: 'shared',
  printed: 'printed',
  published: 'published',
  attributes: 'attributes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt',
  version: 'version'
};

exports.Prisma.CashInOperationScalarFieldEnum = {
  id: 'id',
  cashInId: 'cashInId',
  accountId: 'accountId',
  targetKind: 'targetKind',
  invoiceOutId: 'invoiceOutId',
  amountMinor: 'amountMinor'
};

exports.Prisma.CashOutScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  ownerId: 'ownerId',
  groupId: 'groupId',
  name: 'name',
  code: 'code',
  externalCode: 'externalCode',
  syncId: 'syncId',
  agentId: 'agentId',
  organizationId: 'organizationId',
  cashDeskId: 'cashDeskId',
  salesChannelId: 'salesChannelId',
  contractId: 'contractId',
  projectId: 'projectId',
  expenseItem: 'expenseItem',
  moment: 'moment',
  applicable: 'applicable',
  state: 'state',
  postedAt: 'postedAt',
  sumMinor: 'sumMinor',
  vatSumMinor: 'vatSumMinor',
  currency: 'currency',
  rateValue: 'rateValue',
  paymentPurpose: 'paymentPurpose',
  description: 'description',
  shared: 'shared',
  printed: 'printed',
  published: 'published',
  attributes: 'attributes',
  noClosingDocs: 'noClosingDocs',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt',
  version: 'version'
};

exports.Prisma.CashOutOperationScalarFieldEnum = {
  id: 'id',
  cashOutId: 'cashOutId',
  accountId: 'accountId',
  targetKind: 'targetKind',
  invoiceInId: 'invoiceInId',
  amountMinor: 'amountMinor'
};

exports.Prisma.ProductImageScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  productId: 'productId',
  variantId: 'variantId',
  filename: 'filename',
  mime: 'mime',
  content: 'content',
  sizeBytes: 'sizeBytes',
  position: 'position',
  isMain: 'isMain',
  createdAt: 'createdAt'
};

exports.Prisma.BundleComponentScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  bundleId: 'bundleId',
  componentProductId: 'componentProductId',
  componentVariantId: 'componentVariantId',
  quantity: 'quantity',
  position: 'position',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.VariantScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  productId: 'productId',
  name: 'name',
  code: 'code',
  externalCode: 'externalCode',
  description: 'description',
  barcode: 'barcode',
  barcodes: 'barcodes',
  salePrices: 'salePrices',
  buyPrice: 'buyPrice',
  minPrice: 'minPrice',
  characteristics: 'characteristics',
  weightG: 'weightG',
  volumeML: 'volumeML',
  discountProhibited: 'discountProhibited',
  minimumBalanceMinor: 'minimumBalanceMinor',
  archived: 'archived',
  version: 'version',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.CharacteristicScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  name: 'name',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.CallScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  counterpartyId: 'counterpartyId',
  contactPersonId: 'contactPersonId',
  ownerId: 'ownerId',
  direction: 'direction',
  channel: 'channel',
  status: 'status',
  startedAt: 'startedAt',
  durationSec: 'durationSec',
  externalNumber: 'externalNumber',
  summary: 'summary',
  archived: 'archived',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.CounterpartyNoteScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  counterpartyId: 'counterpartyId',
  authorId: 'authorId',
  text: 'text',
  archived: 'archived',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.TaskScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  authorId: 'authorId',
  assigneeId: 'assigneeId',
  agentId: 'agentId',
  title: 'title',
  description: 'description',
  authorApplication: 'authorApplication',
  operation: 'operation',
  entity: 'entity',
  entityId: 'entityId',
  status: 'status',
  priority: 'priority',
  typeId: 'typeId',
  stateId: 'stateId',
  dueAt: 'dueAt',
  completedAt: 'completedAt',
  done: 'done',
  archived: 'archived',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  version: 'version',
  kind: 'kind',
  hrTemplateId: 'hrTemplateId',
  hrCheckerId: 'hrCheckerId',
  hrResponseType: 'hrResponseType',
  hrDeadlineMinutes: 'hrDeadlineMinutes',
  hrRewardMinor: 'hrRewardMinor',
  hrFineMinor: 'hrFineMinor',
  hrDependsOnId: 'hrDependsOnId'
};

exports.Prisma.TaskTypeScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  name: 'name',
  color: 'color',
  position: 'position',
  archived: 'archived',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.NotificationScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  recipientId: 'recipientId',
  kind: 'kind',
  title: 'title',
  body: 'body',
  entity: 'entity',
  entityId: 'entityId',
  readAt: 'readAt',
  createdAt: 'createdAt'
};

exports.Prisma.RestockTaskScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  type: 'type',
  skladNo: 'skladNo',
  sourceType: 'sourceType',
  sourceId: 'sourceId',
  sourceName: 'sourceName',
  storeId: 'storeId',
  storeName: 'storeName',
  assigneeId: 'assigneeId',
  assigneeName: 'assigneeName',
  createdById: 'createdById',
  createdByName: 'createdByName',
  status: 'status',
  note: 'note',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  version: 'version'
};

exports.Prisma.SkladKeeperScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  skladNo: 'skladNo',
  employeeId: 'employeeId',
  employeeName: 'employeeName',
  printerName: 'printerName',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.RestockTaskLineScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  restockTaskId: 'restockTaskId',
  productId: 'productId',
  productName: 'productName',
  quantity: 'quantity',
  binLocation: 'binLocation',
  confirmedAt: 'confirmedAt',
  confirmedById: 'confirmedById',
  confirmedByName: 'confirmedByName',
  position: 'position'
};

exports.Prisma.ContactPersonScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  counterpartyId: 'counterpartyId',
  ownerId: 'ownerId',
  name: 'name',
  position: 'position',
  phone: 'phone',
  email: 'email',
  description: 'description',
  archived: 'archived',
  createdAt: 'createdAt',
  version: 'version',
  updatedAt: 'updatedAt'
};

exports.Prisma.PriceTypeScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  name: 'name',
  externalCode: 'externalCode',
  currency: 'currency',
  isDefault: 'isDefault',
  position: 'position',
  archived: 'archived',
  createdAt: 'createdAt',
  version: 'version',
  updatedAt: 'updatedAt'
};

exports.Prisma.ProductFolderScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  ownerId: 'ownerId',
  groupId: 'groupId',
  parentId: 'parentId',
  name: 'name',
  code: 'code',
  externalCode: 'externalCode',
  pathName: 'pathName',
  description: 'description',
  shared: 'shared',
  useParentVat: 'useParentVat',
  vat: 'vat',
  vatEnabled: 'vatEnabled',
  effectiveVat: 'effectiveVat',
  effectiveVatEnabled: 'effectiveVatEnabled',
  taxSystem: 'taxSystem',
  archived: 'archived',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.CounterpartyScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  ownerId: 'ownerId',
  groupId: 'groupId',
  priceTypeId: 'priceTypeId',
  stateId: 'stateId',
  bonusProgramId: 'bonusProgramId',
  modifiedById: 'modifiedById',
  name: 'name',
  legalTitle: 'legalTitle',
  legalAddress: 'legalAddress',
  legalAddressFull: 'legalAddressFull',
  actualAddress: 'actualAddress',
  actualAddressFull: 'actualAddressFull',
  companyType: 'companyType',
  email: 'email',
  phone: 'phone',
  fax: 'fax',
  tags: 'tags',
  attributes: 'attributes',
  uzRequisites: 'uzRequisites',
  description: 'description',
  code: 'code',
  externalCode: 'externalCode',
  syncId: 'syncId',
  discountCardNumber: 'discountCardNumber',
  discounts: 'discounts',
  bonusPoints: 'bonusPoints',
  shared: 'shared',
  archived: 'archived',
  salesAmount: 'salesAmount',
  createdAt: 'createdAt',
  version: 'version',
  updatedAt: 'updatedAt'
};

exports.Prisma.GroupScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  name: 'name',
  index: 'index',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.CounterpartyGroupScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  name: 'name',
  index: 'index',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.CounterpartyAccountScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  counterpartyId: 'counterpartyId',
  accountNumber: 'accountNumber',
  bankName: 'bankName',
  bankLocation: 'bankLocation',
  correspondentAccount: 'correspondentAccount',
  mfo: 'mfo',
  bankInn: 'bankInn',
  swift: 'swift',
  currency: 'currency',
  isMain: 'isMain',
  archived: 'archived',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.StateScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  entityType: 'entityType',
  name: 'name',
  color: 'color',
  stateType: 'stateType',
  position: 'position',
  archived: 'archived',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.BonusProgramScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  name: 'name',
  currency: 'currency',
  earnRateRulesJson: 'earnRateRulesJson',
  transactionType: 'transactionType',
  allAgents: 'allAgents',
  agentTags: 'agentTags',
  allProducts: 'allProducts',
  active: 'active',
  archived: 'archived',
  applicableFromDate: 'applicableFromDate',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.CountryScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  ownerId: 'ownerId',
  groupId: 'groupId',
  name: 'name',
  code: 'code',
  externalCode: 'externalCode',
  description: 'description',
  shared: 'shared',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.RegionScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  name: 'name',
  code: 'code',
  externalCode: 'externalCode',
  version: 'version',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.CurrencyScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  code: 'code',
  isoCode: 'isoCode',
  name: 'name',
  fullName: 'fullName',
  default: 'default',
  indirect: 'indirect',
  system: 'system',
  rateValue: 'rateValue',
  rateUpdateType: 'rateUpdateType',
  multiplicity: 'multiplicity',
  margin: 'margin',
  majorUnit: 'majorUnit',
  minorUnit: 'minorUnit',
  archived: 'archived',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.UomScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  ownerId: 'ownerId',
  groupId: 'groupId',
  name: 'name',
  code: 'code',
  externalCode: 'externalCode',
  description: 'description',
  shared: 'shared',
  createdAt: 'createdAt',
  version: 'version',
  updatedAt: 'updatedAt'
};

exports.Prisma.TaxRateScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  ownerId: 'ownerId',
  groupId: 'groupId',
  rate: 'rate',
  comment: 'comment',
  shared: 'shared',
  archived: 'archived',
  createdAt: 'createdAt',
  version: 'version',
  updatedAt: 'updatedAt'
};

exports.Prisma.ExpenseItemScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  name: 'name',
  code: 'code',
  externalCode: 'externalCode',
  description: 'description',
  archived: 'archived',
  createdAt: 'createdAt',
  version: 'version',
  updatedAt: 'updatedAt'
};

exports.Prisma.CustomEntityScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  name: 'name',
  createdAt: 'createdAt',
  version: 'version',
  updatedAt: 'updatedAt'
};

exports.Prisma.CustomEntityValueScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  customEntityId: 'customEntityId',
  name: 'name',
  position: 'position',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ProjectScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  ownerId: 'ownerId',
  groupId: 'groupId',
  name: 'name',
  code: 'code',
  externalCode: 'externalCode',
  description: 'description',
  shared: 'shared',
  attributes: 'attributes',
  archived: 'archived',
  createdAt: 'createdAt',
  version: 'version',
  updatedAt: 'updatedAt'
};

exports.Prisma.SavedFilterScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  ownerId: 'ownerId',
  entity: 'entity',
  name: 'name',
  queryString: 'queryString',
  position: 'position',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt'
};

exports.Prisma.ContractScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  ownerId: 'ownerId',
  groupId: 'groupId',
  agentId: 'agentId',
  agentAccountId: 'agentAccountId',
  ownAgentId: 'ownAgentId',
  organizationAccountId: 'organizationAccountId',
  name: 'name',
  code: 'code',
  externalCode: 'externalCode',
  description: 'description',
  contractType: 'contractType',
  moment: 'moment',
  currency: 'currency',
  rateValue: 'rateValue',
  sumMinor: 'sumMinor',
  rewardPercent: 'rewardPercent',
  rewardType: 'rewardType',
  shared: 'shared',
  printed: 'printed',
  published: 'published',
  attributes: 'attributes',
  archived: 'archived',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.CompanySettingsScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  accountCountry: 'accountCountry',
  defaultCurrencyId: 'defaultCurrencyId',
  globalOperationNumbering: 'globalOperationNumbering',
  checkMinPrice: 'checkMinPrice',
  checkShippingStock: 'checkShippingStock',
  useRecycleBin: 'useRecycleBin',
  useCompanyAddress: 'useCompanyAddress',
  companyAddress: 'companyAddress',
  discountStrategy: 'discountStrategy',
  priceTypesJson: 'priceTypesJson',
  receiptPrinterName: 'receiptPrinterName',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.UserSettingsScalarFieldEnum = {
  id: 'id',
  employeeId: 'employeeId',
  locale: 'locale',
  printFormat: 'printFormat',
  defaultScreen: 'defaultScreen',
  defaultCompanyId: 'defaultCompanyId',
  defaultStoreId: 'defaultStoreId',
  defaultProjectId: 'defaultProjectId',
  defaultCustomerId: 'defaultCustomerId',
  defaultSupplierId: 'defaultSupplierId',
  fieldsPerRow: 'fieldsPerRow',
  autoShowReports: 'autoShowReports',
  mailFooter: 'mailFooter',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.WebhookScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  entityType: 'entityType',
  action: 'action',
  secretHash: 'secretHash',
  url: 'url',
  diffType: 'diffType',
  enabled: 'enabled',
  authContext: 'authContext',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.WebhookDeliveryScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  webhookId: 'webhookId',
  payload: 'payload',
  status: 'status',
  attempt: 'attempt',
  maxAttempts: 'maxAttempts',
  httpStatus: 'httpStatus',
  errorMsg: 'errorMsg',
  nextRetryAt: 'nextRetryAt',
  attemptedAt: 'attemptedAt',
  deliveredAt: 'deliveredAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.WebhookStockScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  stockType: 'stockType',
  reportType: 'reportType',
  reportUrl: 'reportUrl',
  enabled: 'enabled',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ConsignmentScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  productId: 'productId',
  variantId: 'variantId',
  label: 'label',
  name: 'name',
  code: 'code',
  externalCode: 'externalCode',
  description: 'description',
  expiryDate: 'expiryDate',
  barcodes: 'barcodes',
  attributes: 'attributes',
  archived: 'archived',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.BonusOperationScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  ownerId: 'ownerId',
  groupId: 'groupId',
  agentId: 'agentId',
  organizationId: 'organizationId',
  bonusProgramId: 'bonusProgramId',
  name: 'name',
  code: 'code',
  externalCode: 'externalCode',
  description: 'description',
  transactionType: 'transactionType',
  categoryType: 'categoryType',
  transactionStatus: 'transactionStatus',
  bonusValue: 'bonusValue',
  moment: 'moment',
  executionDate: 'executionDate',
  applicable: 'applicable',
  parentEntity: 'parentEntity',
  parentId: 'parentId',
  shared: 'shared',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.DiscountScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  name: 'name',
  kind: 'kind',
  active: 'active',
  allAgents: 'allAgents',
  allProducts: 'allProducts',
  agentTags: 'agentTags',
  rules: 'rules',
  earnRateUzsToPoint: 'earnRateUzsToPoint',
  spendRatePointsToUzs: 'spendRatePointsToUzs',
  maxPaidRatePercents: 'maxPaidRatePercents',
  earnWhileRedeeming: 'earnWhileRedeeming',
  archived: 'archived',
  createdAt: 'createdAt',
  version: 'version',
  updatedAt: 'updatedAt'
};

exports.Prisma.TrackingCodeScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  cis: 'cis',
  cis1162: 'cis1162',
  type: 'type',
  status: 'status',
  productId: 'productId',
  variantId: 'variantId',
  trackingCodes: 'trackingCodes',
  createdAt: 'createdAt',
  version: 'version',
  updatedAt: 'updatedAt'
};

exports.Prisma.PrepaymentScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  ownerId: 'ownerId',
  groupId: 'groupId',
  name: 'name',
  code: 'code',
  externalCode: 'externalCode',
  syncId: 'syncId',
  agentId: 'agentId',
  agentAccountId: 'agentAccountId',
  organizationId: 'organizationId',
  organizationAccountId: 'organizationAccountId',
  customerOrderId: 'customerOrderId',
  retailShiftId: 'retailShiftId',
  retailStoreId: 'retailStoreId',
  contractId: 'contractId',
  projectId: 'projectId',
  moment: 'moment',
  applicable: 'applicable',
  state: 'state',
  postedAt: 'postedAt',
  sumMinor: 'sumMinor',
  vatSumMinor: 'vatSumMinor',
  cashSumMinor: 'cashSumMinor',
  noCashSumMinor: 'noCashSumMinor',
  qrSumMinor: 'qrSumMinor',
  vatEnabled: 'vatEnabled',
  vatIncluded: 'vatIncluded',
  taxSystem: 'taxSystem',
  currency: 'currency',
  rateValue: 'rateValue',
  description: 'description',
  shared: 'shared',
  printed: 'printed',
  published: 'published',
  attributes: 'attributes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt',
  version: 'version'
};

exports.Prisma.PrepaymentReturnScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  ownerId: 'ownerId',
  groupId: 'groupId',
  name: 'name',
  code: 'code',
  externalCode: 'externalCode',
  syncId: 'syncId',
  agentId: 'agentId',
  agentAccountId: 'agentAccountId',
  organizationId: 'organizationId',
  organizationAccountId: 'organizationAccountId',
  prepaymentId: 'prepaymentId',
  retailShiftId: 'retailShiftId',
  retailStoreId: 'retailStoreId',
  contractId: 'contractId',
  projectId: 'projectId',
  moment: 'moment',
  applicable: 'applicable',
  state: 'state',
  postedAt: 'postedAt',
  sumMinor: 'sumMinor',
  vatSumMinor: 'vatSumMinor',
  cashSumMinor: 'cashSumMinor',
  noCashSumMinor: 'noCashSumMinor',
  qrSumMinor: 'qrSumMinor',
  vatEnabled: 'vatEnabled',
  vatIncluded: 'vatIncluded',
  taxSystem: 'taxSystem',
  currency: 'currency',
  rateValue: 'rateValue',
  description: 'description',
  shared: 'shared',
  printed: 'printed',
  published: 'published',
  attributes: 'attributes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt',
  version: 'version'
};

exports.Prisma.InternalOrderScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  ownerId: 'ownerId',
  groupId: 'groupId',
  name: 'name',
  code: 'code',
  externalCode: 'externalCode',
  syncId: 'syncId',
  organizationId: 'organizationId',
  storeId: 'storeId',
  projectId: 'projectId',
  moment: 'moment',
  deliveryPlannedMoment: 'deliveryPlannedMoment',
  applicable: 'applicable',
  state: 'state',
  postedAt: 'postedAt',
  sumMinor: 'sumMinor',
  vatSumMinor: 'vatSumMinor',
  movedSumMinor: 'movedSumMinor',
  vatEnabled: 'vatEnabled',
  vatIncluded: 'vatIncluded',
  currency: 'currency',
  rateValue: 'rateValue',
  description: 'description',
  shared: 'shared',
  printed: 'printed',
  published: 'published',
  attributes: 'attributes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt',
  version: 'version'
};

exports.Prisma.InternalOrderPositionScalarFieldEnum = {
  id: 'id',
  internalOrderId: 'internalOrderId',
  accountId: 'accountId',
  position: 'position',
  assortmentKind: 'assortmentKind',
  assortmentId: 'assortmentId',
  productId: 'productId',
  quantity: 'quantity',
  movedQuantity: 'movedQuantity',
  priceMinor: 'priceMinor',
  vat: 'vat',
  vatEnabled: 'vatEnabled'
};

exports.Prisma.CounterpartyAdjustmentScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  ownerId: 'ownerId',
  groupId: 'groupId',
  name: 'name',
  code: 'code',
  externalCode: 'externalCode',
  syncId: 'syncId',
  agentId: 'agentId',
  organizationId: 'organizationId',
  contractId: 'contractId',
  projectId: 'projectId',
  moment: 'moment',
  applicable: 'applicable',
  state: 'state',
  postedAt: 'postedAt',
  direction: 'direction',
  sumMinor: 'sumMinor',
  currency: 'currency',
  rateValue: 'rateValue',
  description: 'description',
  shared: 'shared',
  printed: 'printed',
  published: 'published',
  attributes: 'attributes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt',
  version: 'version'
};

exports.Prisma.PriceListScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  ownerId: 'ownerId',
  groupId: 'groupId',
  name: 'name',
  code: 'code',
  externalCode: 'externalCode',
  syncId: 'syncId',
  organizationId: 'organizationId',
  priceTypeId: 'priceTypeId',
  moment: 'moment',
  state: 'state',
  applicable: 'applicable',
  pricesJson: 'pricesJson',
  currency: 'currency',
  rateValue: 'rateValue',
  description: 'description',
  shared: 'shared',
  printed: 'printed',
  published: 'published',
  attributes: 'attributes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt',
  version: 'version'
};

exports.Prisma.RetailDrawerCashInScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  ownerId: 'ownerId',
  groupId: 'groupId',
  name: 'name',
  code: 'code',
  externalCode: 'externalCode',
  syncId: 'syncId',
  retailShiftId: 'retailShiftId',
  agentId: 'agentId',
  organizationId: 'organizationId',
  moment: 'moment',
  applicable: 'applicable',
  state: 'state',
  postedAt: 'postedAt',
  sumMinor: 'sumMinor',
  currency: 'currency',
  rateValue: 'rateValue',
  description: 'description',
  shared: 'shared',
  printed: 'printed',
  published: 'published',
  attributes: 'attributes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt'
};

exports.Prisma.RetailDrawerCashOutScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  ownerId: 'ownerId',
  groupId: 'groupId',
  name: 'name',
  code: 'code',
  externalCode: 'externalCode',
  syncId: 'syncId',
  retailShiftId: 'retailShiftId',
  agentId: 'agentId',
  organizationId: 'organizationId',
  moment: 'moment',
  applicable: 'applicable',
  state: 'state',
  postedAt: 'postedAt',
  sumMinor: 'sumMinor',
  currency: 'currency',
  rateValue: 'rateValue',
  description: 'description',
  shared: 'shared',
  printed: 'printed',
  published: 'published',
  attributes: 'attributes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt'
};

exports.Prisma.RetailSalesReturnScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  ownerId: 'ownerId',
  groupId: 'groupId',
  name: 'name',
  code: 'code',
  externalCode: 'externalCode',
  syncId: 'syncId',
  agentId: 'agentId',
  agentAccountId: 'agentAccountId',
  organizationId: 'organizationId',
  organizationAccountId: 'organizationAccountId',
  storeId: 'storeId',
  retailShiftId: 'retailShiftId',
  retailStoreId: 'retailStoreId',
  demandId: 'demandId',
  moment: 'moment',
  applicable: 'applicable',
  state: 'state',
  postedAt: 'postedAt',
  sumMinor: 'sumMinor',
  vatSumMinor: 'vatSumMinor',
  cashSumMinor: 'cashSumMinor',
  noCashSumMinor: 'noCashSumMinor',
  qrSumMinor: 'qrSumMinor',
  vatEnabled: 'vatEnabled',
  vatIncluded: 'vatIncluded',
  taxSystem: 'taxSystem',
  currency: 'currency',
  rateValue: 'rateValue',
  description: 'description',
  shared: 'shared',
  printed: 'printed',
  published: 'published',
  attributes: 'attributes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt'
};

exports.Prisma.RetailStoreScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  ownerId: 'ownerId',
  groupId: 'groupId',
  organizationId: 'organizationId',
  storeId: 'storeId',
  name: 'name',
  description: 'description',
  externalCode: 'externalCode',
  syncId: 'syncId',
  address: 'address',
  addressFull: 'addressFull',
  active: 'active',
  archived: 'archived',
  authTokenAttached: 'authTokenAttached',
  controlCashierChoice: 'controlCashierChoice',
  controlShippingStock: 'controlShippingStock',
  allowCreateProducts: 'allowCreateProducts',
  allowCustomPrice: 'allowCustomPrice',
  allowDeleteReceiptPositions: 'allowDeleteReceiptPositions',
  allowSellTobaccoWithoutMRC: 'allowSellTobaccoWithoutMRC',
  discountEnable: 'discountEnable',
  discountMaxPercent: 'discountMaxPercent',
  enableReturnsWithNoReason: 'enableReturnsWithNoReason',
  returnFromClosedShiftEnabled: 'returnFromClosedShiftEnabled',
  sellReserves: 'sellReserves',
  reservePrepaidGoods: 'reservePrepaidGoods',
  onlyInStock: 'onlyInStock',
  printAlways: 'printAlways',
  showBeerOnTap: 'showBeerOnTap',
  createCashInOnRetailShiftClosing: 'createCashInOnRetailShiftClosing',
  createPaymentInOnRetailShiftClosing: 'createPaymentInOnRetailShiftClosing',
  syncAgents: 'syncAgents',
  issueOrders: 'issueOrders',
  demandPrefix: 'demandPrefix',
  requiredFio: 'requiredFio',
  requiredPhone: 'requiredPhone',
  requiredEmail: 'requiredEmail',
  requiredBirthdate: 'requiredBirthdate',
  requiredSex: 'requiredSex',
  requiredDiscountCardNumber: 'requiredDiscountCardNumber',
  defaultTaxSystem: 'defaultTaxSystem',
  orderTaxSystem: 'orderTaxSystem',
  fiscalType: 'fiscalType',
  ofdEnabled: 'ofdEnabled',
  priorityOfdSend: 'priorityOfdSend',
  sendMarksForCheck: 'sendMarksForCheck',
  sendMarksToChestnyZnakOnCloud: 'sendMarksToChestnyZnakOnCloud',
  markingSellingMode: 'markingSellingMode',
  marksCheckMode: 'marksCheckMode',
  tobaccoMrcControlType: 'tobaccoMrcControlType',
  bankPercent: 'bankPercent',
  qrPayEnabled: 'qrPayEnabled',
  qrBankPercent: 'qrBankPercent',
  qrTerminalId: 'qrTerminalId',
  idQR: 'idQR',
  minionToMasterType: 'minionToMasterType',
  masterRetailStores: 'masterRetailStores',
  productFolders: 'productFolders',
  createAgentsTags: 'createAgentsTags',
  filterAgentsTags: 'filterAgentsTags',
  createOrderWithStateId: 'createOrderWithStateId',
  orderToStateId: 'orderToStateId',
  customerOrderStatesJson: 'customerOrderStatesJson',
  cashiersJson: 'cashiersJson',
  acquireId: 'acquireId',
  qrAcquireId: 'qrAcquireId',
  receiptTemplateId: 'receiptTemplateId',
  priceTypeId: 'priceTypeId',
  environmentJson: 'environmentJson',
  lastOperationNamesJson: 'lastOperationNamesJson',
  state: 'state',
  shared: 'shared',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  organizationAccountId: 'organizationAccountId'
};

exports.Prisma.ProcessingProcessScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  ownerId: 'ownerId',
  groupId: 'groupId',
  name: 'name',
  code: 'code',
  externalCode: 'externalCode',
  description: 'description',
  shared: 'shared',
  archived: 'archived',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  version: 'version'
};

exports.Prisma.ProcessingStageScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  ownerId: 'ownerId',
  groupId: 'groupId',
  name: 'name',
  code: 'code',
  externalCode: 'externalCode',
  description: 'description',
  laborCostMinor: 'laborCostMinor',
  materialMarkup: 'materialMarkup',
  allPerformers: 'allPerformers',
  distributionRequired: 'distributionRequired',
  standardHourCostMinor: 'standardHourCostMinor',
  materialStoreId: 'materialStoreId',
  shared: 'shared',
  archived: 'archived',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  version: 'version'
};

exports.Prisma.ProcessingStagePerformerScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  stageId: 'stageId',
  employeeId: 'employeeId'
};

exports.Prisma.ProcessingProcessPositionScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  processId: 'processId',
  processingStageId: 'processingStageId',
  position: 'position',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ProcessingProcessPositionEdgeScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  fromPositionId: 'fromPositionId',
  toPositionId: 'toPositionId'
};

exports.Prisma.ProcessingPlanFolderScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  ownerId: 'ownerId',
  groupId: 'groupId',
  parentId: 'parentId',
  name: 'name',
  code: 'code',
  externalCode: 'externalCode',
  pathName: 'pathName',
  description: 'description',
  shared: 'shared',
  archived: 'archived',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ProductionScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  ownerId: 'ownerId',
  groupId: 'groupId',
  name: 'name',
  code: 'code',
  externalCode: 'externalCode',
  syncId: 'syncId',
  organizationId: 'organizationId',
  storeId: 'storeId',
  materialsStoreId: 'materialsStoreId',
  customerOrderId: 'customerOrderId',
  projectId: 'projectId',
  moment: 'moment',
  deliveryPlannedMoment: 'deliveryPlannedMoment',
  productionStart: 'productionStart',
  productionEnd: 'productionEnd',
  reserve: 'reserve',
  awaiting: 'awaiting',
  applicable: 'applicable',
  state: 'state',
  postedAt: 'postedAt',
  sumMinor: 'sumMinor',
  vatSumMinor: 'vatSumMinor',
  vatEnabled: 'vatEnabled',
  vatIncluded: 'vatIncluded',
  currency: 'currency',
  rateValue: 'rateValue',
  description: 'description',
  shared: 'shared',
  printed: 'printed',
  published: 'published',
  attributes: 'attributes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt',
  version: 'version'
};

exports.Prisma.ProcessingOrderScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  ownerId: 'ownerId',
  groupId: 'groupId',
  name: 'name',
  code: 'code',
  externalCode: 'externalCode',
  syncId: 'syncId',
  organizationId: 'organizationId',
  storeId: 'storeId',
  productionId: 'productionId',
  processingPlanId: 'processingPlanId',
  projectId: 'projectId',
  moment: 'moment',
  applicable: 'applicable',
  state: 'state',
  postedAt: 'postedAt',
  quantity: 'quantity',
  deliveryPlannedMoment: 'deliveryPlannedMoment',
  sumMinor: 'sumMinor',
  movedSumMinor: 'movedSumMinor',
  description: 'description',
  shared: 'shared',
  printed: 'printed',
  published: 'published',
  attributes: 'attributes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt',
  version: 'version'
};

exports.Prisma.ProcessingScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  ownerId: 'ownerId',
  groupId: 'groupId',
  name: 'name',
  code: 'code',
  externalCode: 'externalCode',
  syncId: 'syncId',
  organizationId: 'organizationId',
  organizationAccountId: 'organizationAccountId',
  materialsStoreId: 'materialsStoreId',
  productsStoreId: 'productsStoreId',
  processingOrderId: 'processingOrderId',
  processingPlanId: 'processingPlanId',
  projectId: 'projectId',
  processingStageId: 'processingStageId',
  performerId: 'performerId',
  defect: 'defect',
  enableHourAccounting: 'enableHourAccounting',
  labourUnitCostMinor: 'labourUnitCostMinor',
  standardHourUnit: 'standardHourUnit',
  standardHourCostMinor: 'standardHourCostMinor',
  moment: 'moment',
  applicable: 'applicable',
  state: 'state',
  postedAt: 'postedAt',
  quantity: 'quantity',
  costSumMinor: 'costSumMinor',
  materialsSnapshot: 'materialsSnapshot',
  description: 'description',
  shared: 'shared',
  printed: 'printed',
  published: 'published',
  attributes: 'attributes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt',
  version: 'version'
};

exports.Prisma.ProcessingMaterialScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  processingId: 'processingId',
  productId: 'productId',
  qty: 'qty',
  position: 'position'
};

exports.Prisma.ProcessingProductScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  processingId: 'processingId',
  productId: 'productId',
  qty: 'qty',
  position: 'position'
};

exports.Prisma.PayrollScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  ownerId: 'ownerId',
  groupId: 'groupId',
  name: 'name',
  code: 'code',
  externalCode: 'externalCode',
  syncId: 'syncId',
  organizationId: 'organizationId',
  employeeId: 'employeeId',
  periodStart: 'periodStart',
  periodEnd: 'periodEnd',
  moment: 'moment',
  applicable: 'applicable',
  state: 'state',
  postedAt: 'postedAt',
  sumMinor: 'sumMinor',
  currency: 'currency',
  rateValue: 'rateValue',
  description: 'description',
  shared: 'shared',
  printed: 'printed',
  published: 'published',
  attributes: 'attributes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt',
  version: 'version'
};

exports.Prisma.LabelTemplateScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  name: 'name',
  description: 'description',
  pageSize: 'pageSize',
  pageWidthMm: 'pageWidthMm',
  pageHeightMm: 'pageHeightMm',
  cols: 'cols',
  rows: 'rows',
  marginTopMm: 'marginTopMm',
  marginLeftMm: 'marginLeftMm',
  columnGapMm: 'columnGapMm',
  rowGapMm: 'rowGapMm',
  labelWidthMm: 'labelWidthMm',
  labelHeightMm: 'labelHeightMm',
  includeName: 'includeName',
  includePrice: 'includePrice',
  includeBarcode: 'includeBarcode',
  includeArticle: 'includeArticle',
  includeLocation: 'includeLocation',
  headerText: 'headerText',
  barcodeFormat: 'barcodeFormat',
  archived: 'archived',
  createdAt: 'createdAt',
  version: 'version',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt'
};

exports.Prisma.LabelPrintJobScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  ownerId: 'ownerId',
  templateId: 'templateId',
  itemsSnapshot: 'itemsSnapshot',
  totalLabels: 'totalLabels',
  pageCount: 'pageCount',
  createdAt: 'createdAt'
};

exports.Prisma.PublicationScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  ownerId: 'ownerId',
  targetType: 'targetType',
  targetId: 'targetId',
  token: 'token',
  description: 'description',
  viewCount: 'viewCount',
  lastViewedAt: 'lastViewedAt',
  expiresAt: 'expiresAt',
  passwordHash: 'passwordHash',
  revokedAt: 'revokedAt',
  createdAt: 'createdAt',
  version: 'version',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt'
};

exports.Prisma.PayrollLineScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  payrollId: 'payrollId',
  position: 'position',
  itemType: 'itemType',
  itemName: 'itemName',
  sumMinor: 'sumMinor',
  meta: 'meta'
};

exports.Prisma.FactureOutScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  ownerId: 'ownerId',
  groupId: 'groupId',
  name: 'name',
  code: 'code',
  externalCode: 'externalCode',
  syncId: 'syncId',
  agentId: 'agentId',
  organizationId: 'organizationId',
  demandId: 'demandId',
  purchaseReturnId: 'purchaseReturnId',
  paymentInId: 'paymentInId',
  advanceVatRate: 'advanceVatRate',
  moment: 'moment',
  applicable: 'applicable',
  state: 'state',
  postedAt: 'postedAt',
  sumMinor: 'sumMinor',
  vatSumMinor: 'vatSumMinor',
  vatEnabled: 'vatEnabled',
  vatIncluded: 'vatIncluded',
  currency: 'currency',
  rateValue: 'rateValue',
  description: 'description',
  shared: 'shared',
  printed: 'printed',
  published: 'published',
  attributes: 'attributes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt'
};

exports.Prisma.FactureOutDemandScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  factureOutId: 'factureOutId',
  demandId: 'demandId'
};

exports.Prisma.FactureInScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  ownerId: 'ownerId',
  groupId: 'groupId',
  name: 'name',
  code: 'code',
  externalCode: 'externalCode',
  syncId: 'syncId',
  agentId: 'agentId',
  organizationId: 'organizationId',
  supplyId: 'supplyId',
  paymentOutId: 'paymentOutId',
  incomingNumber: 'incomingNumber',
  incomingDate: 'incomingDate',
  moment: 'moment',
  applicable: 'applicable',
  state: 'state',
  postedAt: 'postedAt',
  sumMinor: 'sumMinor',
  vatSumMinor: 'vatSumMinor',
  vatEnabled: 'vatEnabled',
  vatIncluded: 'vatIncluded',
  currency: 'currency',
  rateValue: 'rateValue',
  description: 'description',
  shared: 'shared',
  printed: 'printed',
  published: 'published',
  attributes: 'attributes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt'
};

exports.Prisma.FactureInSupplyScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  factureInId: 'factureInId',
  supplyId: 'supplyId'
};

exports.Prisma.CommissionReportOutScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  ownerId: 'ownerId',
  groupId: 'groupId',
  name: 'name',
  code: 'code',
  externalCode: 'externalCode',
  syncId: 'syncId',
  agentId: 'agentId',
  organizationId: 'organizationId',
  contractId: 'contractId',
  moment: 'moment',
  applicable: 'applicable',
  state: 'state',
  postedAt: 'postedAt',
  sumMinor: 'sumMinor',
  vatSumMinor: 'vatSumMinor',
  rewardSumMinor: 'rewardSumMinor',
  rewardVatSumMinor: 'rewardVatSumMinor',
  payedSumMinor: 'payedSumMinor',
  vatEnabled: 'vatEnabled',
  vatIncluded: 'vatIncluded',
  currency: 'currency',
  rateValue: 'rateValue',
  description: 'description',
  shared: 'shared',
  printed: 'printed',
  published: 'published',
  attributes: 'attributes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt'
};

exports.Prisma.CommissionReportInScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  ownerId: 'ownerId',
  groupId: 'groupId',
  name: 'name',
  code: 'code',
  externalCode: 'externalCode',
  syncId: 'syncId',
  agentId: 'agentId',
  organizationId: 'organizationId',
  contractId: 'contractId',
  moment: 'moment',
  applicable: 'applicable',
  state: 'state',
  postedAt: 'postedAt',
  sumMinor: 'sumMinor',
  vatSumMinor: 'vatSumMinor',
  rewardSumMinor: 'rewardSumMinor',
  rewardVatSumMinor: 'rewardVatSumMinor',
  payedSumMinor: 'payedSumMinor',
  vatEnabled: 'vatEnabled',
  vatIncluded: 'vatIncluded',
  currency: 'currency',
  rateValue: 'rateValue',
  description: 'description',
  shared: 'shared',
  printed: 'printed',
  published: 'published',
  attributes: 'attributes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt'
};

exports.Prisma.EmissionOrderScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  ownerId: 'ownerId',
  groupId: 'groupId',
  name: 'name',
  code: 'code',
  externalCode: 'externalCode',
  organizationId: 'organizationId',
  moment: 'moment',
  applicable: 'applicable',
  state: 'state',
  productGroup: 'productGroup',
  codesRequested: 'codesRequested',
  codesIssued: 'codesIssued',
  description: 'description',
  shared: 'shared',
  printed: 'printed',
  published: 'published',
  attributes: 'attributes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt'
};

exports.Prisma.MarkingCodeOrderScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  ownerId: 'ownerId',
  groupId: 'groupId',
  name: 'name',
  code: 'code',
  externalCode: 'externalCode',
  organizationId: 'organizationId',
  emissionOrderId: 'emissionOrderId',
  moment: 'moment',
  applicable: 'applicable',
  state: 'state',
  codesJson: 'codesJson',
  codesCount: 'codesCount',
  description: 'description',
  shared: 'shared',
  printed: 'printed',
  published: 'published',
  attributes: 'attributes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt'
};

exports.Prisma.RetireOrderScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  ownerId: 'ownerId',
  groupId: 'groupId',
  name: 'name',
  code: 'code',
  externalCode: 'externalCode',
  organizationId: 'organizationId',
  parentEntity: 'parentEntity',
  parentId: 'parentId',
  moment: 'moment',
  applicable: 'applicable',
  state: 'state',
  retireType: 'retireType',
  codesJson: 'codesJson',
  syncId: 'syncId',
  vatSumMinor: 'vatSumMinor',
  currency: 'currency',
  rateValue: 'rateValue',
  description: 'description',
  shared: 'shared',
  printed: 'printed',
  published: 'published',
  attributes: 'attributes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt'
};

exports.Prisma.ProductScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  ownerId: 'ownerId',
  productFolderId: 'productFolderId',
  groupId: 'groupId',
  supplierId: 'supplierId',
  modifiedById: 'modifiedById',
  name: 'name',
  code: 'code',
  externalCode: 'externalCode',
  article: 'article',
  description: 'description',
  pathName: 'pathName',
  country: 'country',
  kind: 'kind',
  minPrice: 'minPrice',
  buyPrice: 'buyPrice',
  buyPriceCurrency: 'buyPriceCurrency',
  minPriceCurrency: 'minPriceCurrency',
  salePrices: 'salePrices',
  weightG: 'weightG',
  volumeML: 'volumeML',
  weighed: 'weighed',
  uom: 'uom',
  locSklad: 'locSklad',
  locPolka: 'locPolka',
  locQavat: 'locQavat',
  locYacheyka: 'locYacheyka',
  forwardMax: 'forwardMax',
  vat: 'vat',
  vatEnabled: 'vatEnabled',
  useParentVat: 'useParentVat',
  taxSystem: 'taxSystem',
  mxikCode: 'mxikCode',
  trackingType: 'trackingType',
  gtin: 'gtin',
  partialDisposal: 'partialDisposal',
  paymentItemType: 'paymentItemType',
  isSerialTrackable: 'isSerialTrackable',
  discountProhibited: 'discountProhibited',
  minimumBalanceMinor: 'minimumBalanceMinor',
  shared: 'shared',
  archived: 'archived',
  syncId: 'syncId',
  barcodes: 'barcodes',
  barcodeTypes: 'barcodeTypes',
  attributes: 'attributes',
  version: 'version',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt'
};

exports.Prisma.ProductLocationScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  productId: 'productId',
  sklad: 'sklad',
  polka: 'polka',
  qavat: 'qavat',
  yacheyka: 'yacheyka',
  note: 'note',
  position: 'position',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ProductAnalogScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  productId: 'productId',
  analogId: 'analogId',
  position: 'position',
  createdAt: 'createdAt'
};

exports.Prisma.ProductPackScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  productId: 'productId',
  variantId: 'variantId',
  name: 'name',
  uomCode: 'uomCode',
  multiplier: 'multiplier',
  barcode: 'barcode',
  codeType: 'codeType',
  tasnifCode: 'tasnifCode',
  position: 'position',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.CustomerOrderScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  ownerId: 'ownerId',
  groupId: 'groupId',
  name: 'name',
  code: 'code',
  externalCode: 'externalCode',
  syncId: 'syncId',
  agentId: 'agentId',
  agentAccountId: 'agentAccountId',
  organizationId: 'organizationId',
  organizationAccountId: 'organizationAccountId',
  storeId: 'storeId',
  salesChannelId: 'salesChannelId',
  statusId: 'statusId',
  contractId: 'contractId',
  projectId: 'projectId',
  taxSystem: 'taxSystem',
  moment: 'moment',
  deliveryPlannedMoment: 'deliveryPlannedMoment',
  applicable: 'applicable',
  state: 'state',
  sumMinor: 'sumMinor',
  vatSumMinor: 'vatSumMinor',
  payedSumMinor: 'payedSumMinor',
  invoicedSumMinor: 'invoicedSumMinor',
  reservedSumMinor: 'reservedSumMinor',
  shippedSumMinor: 'shippedSumMinor',
  vatEnabled: 'vatEnabled',
  vatIncluded: 'vatIncluded',
  currency: 'currency',
  rateValue: 'rateValue',
  shipmentAddress: 'shipmentAddress',
  shipmentAddressFull: 'shipmentAddressFull',
  description: 'description',
  shared: 'shared',
  printed: 'printed',
  published: 'published',
  attributes: 'attributes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt',
  version: 'version'
};

exports.Prisma.CustomerOrderPositionScalarFieldEnum = {
  id: 'id',
  customerOrderId: 'customerOrderId',
  accountId: 'accountId',
  position: 'position',
  assortmentKind: 'assortmentKind',
  assortmentId: 'assortmentId',
  productId: 'productId',
  quantity: 'quantity',
  reservedQty: 'reservedQty',
  shippedQty: 'shippedQty',
  priceMinor: 'priceMinor',
  discount: 'discount',
  vat: 'vat',
  vatEnabled: 'vatEnabled'
};

exports.Prisma.InvoiceOutScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  ownerId: 'ownerId',
  groupId: 'groupId',
  name: 'name',
  code: 'code',
  externalCode: 'externalCode',
  syncId: 'syncId',
  agentId: 'agentId',
  agentAccountId: 'agentAccountId',
  organizationId: 'organizationId',
  organizationAccountId: 'organizationAccountId',
  storeId: 'storeId',
  salesChannelId: 'salesChannelId',
  contractId: 'contractId',
  projectId: 'projectId',
  customerOrderId: 'customerOrderId',
  moment: 'moment',
  paymentPlannedMoment: 'paymentPlannedMoment',
  applicable: 'applicable',
  state: 'state',
  postedAt: 'postedAt',
  sentAt: 'sentAt',
  sumMinor: 'sumMinor',
  vatSumMinor: 'vatSumMinor',
  payedSumMinor: 'payedSumMinor',
  shippedSumMinor: 'shippedSumMinor',
  vatEnabled: 'vatEnabled',
  vatIncluded: 'vatIncluded',
  currency: 'currency',
  rateValue: 'rateValue',
  description: 'description',
  shared: 'shared',
  printed: 'printed',
  published: 'published',
  attributes: 'attributes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt',
  version: 'version'
};

exports.Prisma.InvoiceOutPositionScalarFieldEnum = {
  id: 'id',
  invoiceOutId: 'invoiceOutId',
  accountId: 'accountId',
  position: 'position',
  assortmentKind: 'assortmentKind',
  assortmentId: 'assortmentId',
  productId: 'productId',
  customerOrderPositionId: 'customerOrderPositionId',
  quantity: 'quantity',
  priceMinor: 'priceMinor',
  discount: 'discount',
  vat: 'vat',
  vatEnabled: 'vatEnabled'
};

exports.Prisma.SupplyScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  ownerId: 'ownerId',
  groupId: 'groupId',
  name: 'name',
  code: 'code',
  externalCode: 'externalCode',
  syncId: 'syncId',
  agentId: 'agentId',
  agentAccountId: 'agentAccountId',
  organizationId: 'organizationId',
  organizationAccountId: 'organizationAccountId',
  storeId: 'storeId',
  moment: 'moment',
  incomingDate: 'incomingDate',
  incomingNumber: 'incomingNumber',
  applicable: 'applicable',
  state: 'state',
  postedAt: 'postedAt',
  sumMinor: 'sumMinor',
  vatSumMinor: 'vatSumMinor',
  costSumMinor: 'costSumMinor',
  payedSumMinor: 'payedSumMinor',
  overheadSumMinor: 'overheadSumMinor',
  overheadDistribution: 'overheadDistribution',
  overheadCurrency: 'overheadCurrency',
  vatEnabled: 'vatEnabled',
  vatIncluded: 'vatIncluded',
  currency: 'currency',
  rateValue: 'rateValue',
  description: 'description',
  shared: 'shared',
  printed: 'printed',
  published: 'published',
  attributes: 'attributes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt',
  version: 'version',
  purchaseOrderId: 'purchaseOrderId',
  contractId: 'contractId',
  projectId: 'projectId'
};

exports.Prisma.SupplyPositionScalarFieldEnum = {
  id: 'id',
  supplyId: 'supplyId',
  accountId: 'accountId',
  position: 'position',
  assortmentKind: 'assortmentKind',
  assortmentId: 'assortmentId',
  productId: 'productId',
  quantity: 'quantity',
  remainingQty: 'remainingQty',
  priceMinor: 'priceMinor',
  discount: 'discount',
  vat: 'vat',
  vatEnabled: 'vatEnabled',
  costMinor: 'costMinor',
  purchaseOrderPositionId: 'purchaseOrderPositionId',
  gtdNumber: 'gtdNumber',
  gtdSumMinor: 'gtdSumMinor',
  countryId: 'countryId'
};

exports.Prisma.PurchaseOrderScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  ownerId: 'ownerId',
  groupId: 'groupId',
  modifiedById: 'modifiedById',
  name: 'name',
  code: 'code',
  externalCode: 'externalCode',
  syncId: 'syncId',
  agentId: 'agentId',
  agentAccountId: 'agentAccountId',
  organizationId: 'organizationId',
  organizationAccountId: 'organizationAccountId',
  storeId: 'storeId',
  projectId: 'projectId',
  contractId: 'contractId',
  statusId: 'statusId',
  moment: 'moment',
  deliveryPlannedMoment: 'deliveryPlannedMoment',
  applicable: 'applicable',
  state: 'state',
  postedAt: 'postedAt',
  sumMinor: 'sumMinor',
  vatSumMinor: 'vatSumMinor',
  payedSumMinor: 'payedSumMinor',
  invoicedSumMinor: 'invoicedSumMinor',
  receivedSumMinor: 'receivedSumMinor',
  shippedSumMinor: 'shippedSumMinor',
  waitSumMinor: 'waitSumMinor',
  vatEnabled: 'vatEnabled',
  vatIncluded: 'vatIncluded',
  currency: 'currency',
  rateValue: 'rateValue',
  description: 'description',
  shared: 'shared',
  printed: 'printed',
  published: 'published',
  waiting: 'waiting',
  attributes: 'attributes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt',
  version: 'version'
};

exports.Prisma.PurchaseOrderPositionScalarFieldEnum = {
  id: 'id',
  purchaseOrderId: 'purchaseOrderId',
  accountId: 'accountId',
  position: 'position',
  assortmentKind: 'assortmentKind',
  assortmentId: 'assortmentId',
  productId: 'productId',
  quantity: 'quantity',
  receivedQty: 'receivedQty',
  priceMinor: 'priceMinor',
  discount: 'discount',
  vat: 'vat',
  vatEnabled: 'vatEnabled'
};

exports.Prisma.PaymentInScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  ownerId: 'ownerId',
  groupId: 'groupId',
  name: 'name',
  code: 'code',
  externalCode: 'externalCode',
  syncId: 'syncId',
  agentId: 'agentId',
  agentAccountId: 'agentAccountId',
  organizationId: 'organizationId',
  organizationAccountId: 'organizationAccountId',
  salesChannelId: 'salesChannelId',
  contractId: 'contractId',
  projectId: 'projectId',
  moment: 'moment',
  applicable: 'applicable',
  state: 'state',
  postedAt: 'postedAt',
  sumMinor: 'sumMinor',
  vatSumMinor: 'vatSumMinor',
  currency: 'currency',
  rateValue: 'rateValue',
  paymentPurpose: 'paymentPurpose',
  incomingDate: 'incomingDate',
  incomingNumber: 'incomingNumber',
  description: 'description',
  shared: 'shared',
  printed: 'printed',
  published: 'published',
  attributes: 'attributes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt',
  version: 'version'
};

exports.Prisma.PaymentInOperationScalarFieldEnum = {
  id: 'id',
  paymentInId: 'paymentInId',
  accountId: 'accountId',
  targetKind: 'targetKind',
  invoiceOutId: 'invoiceOutId',
  customerOrderId: 'customerOrderId',
  amountMinor: 'amountMinor'
};

exports.Prisma.PaymentOutScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  ownerId: 'ownerId',
  groupId: 'groupId',
  name: 'name',
  code: 'code',
  externalCode: 'externalCode',
  syncId: 'syncId',
  agentId: 'agentId',
  agentAccountId: 'agentAccountId',
  organizationId: 'organizationId',
  organizationAccountId: 'organizationAccountId',
  salesChannelId: 'salesChannelId',
  contractId: 'contractId',
  projectId: 'projectId',
  expenseItem: 'expenseItem',
  moment: 'moment',
  applicable: 'applicable',
  state: 'state',
  postedAt: 'postedAt',
  sumMinor: 'sumMinor',
  vatSumMinor: 'vatSumMinor',
  currency: 'currency',
  rateValue: 'rateValue',
  paymentPurpose: 'paymentPurpose',
  description: 'description',
  shared: 'shared',
  printed: 'printed',
  published: 'published',
  attributes: 'attributes',
  noClosingDocs: 'noClosingDocs',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt',
  version: 'version'
};

exports.Prisma.PaymentOutOperationScalarFieldEnum = {
  id: 'id',
  paymentOutId: 'paymentOutId',
  accountId: 'accountId',
  targetKind: 'targetKind',
  invoiceInId: 'invoiceInId',
  purchaseOrderId: 'purchaseOrderId',
  amountMinor: 'amountMinor'
};

exports.Prisma.DemandScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  ownerId: 'ownerId',
  groupId: 'groupId',
  name: 'name',
  code: 'code',
  externalCode: 'externalCode',
  syncId: 'syncId',
  agentId: 'agentId',
  agentAccountId: 'agentAccountId',
  organizationId: 'organizationId',
  organizationAccountId: 'organizationAccountId',
  storeId: 'storeId',
  customerOrderId: 'customerOrderId',
  salesChannelId: 'salesChannelId',
  contractId: 'contractId',
  projectId: 'projectId',
  deliveryPlannedMoment: 'deliveryPlannedMoment',
  paymentPlannedMoment: 'paymentPlannedMoment',
  consignorId: 'consignorId',
  consigneeId: 'consigneeId',
  carrierId: 'carrierId',
  cargoName: 'cargoName',
  shipperInstructions: 'shipperInstructions',
  transportFacility: 'transportFacility',
  carNumber: 'carNumber',
  placesCount: 'placesCount',
  shippingDocNo: 'shippingDocNo',
  shippingDocDate: 'shippingDocDate',
  stateContractId: 'stateContractId',
  moment: 'moment',
  applicable: 'applicable',
  state: 'state',
  postedAt: 'postedAt',
  sumMinor: 'sumMinor',
  vatSumMinor: 'vatSumMinor',
  costSumMinor: 'costSumMinor',
  payedSumMinor: 'payedSumMinor',
  overheadSumMinor: 'overheadSumMinor',
  overheadDistribution: 'overheadDistribution',
  overheadCurrency: 'overheadCurrency',
  vatEnabled: 'vatEnabled',
  vatIncluded: 'vatIncluded',
  currency: 'currency',
  rateValue: 'rateValue',
  shipmentAddress: 'shipmentAddress',
  shipmentAddressFull: 'shipmentAddressFull',
  description: 'description',
  shared: 'shared',
  printed: 'printed',
  published: 'published',
  attributes: 'attributes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt',
  version: 'version'
};

exports.Prisma.DemandPositionCostConsumptionScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  demandPositionId: 'demandPositionId',
  supplyPositionId: 'supplyPositionId',
  quantity: 'quantity',
  unitCostMinor: 'unitCostMinor',
  lineCostMinor: 'lineCostMinor',
  createdAt: 'createdAt'
};

exports.Prisma.DemandPositionScalarFieldEnum = {
  id: 'id',
  demandId: 'demandId',
  accountId: 'accountId',
  position: 'position',
  assortmentKind: 'assortmentKind',
  assortmentId: 'assortmentId',
  productId: 'productId',
  customerOrderPositionId: 'customerOrderPositionId',
  quantity: 'quantity',
  priceMinor: 'priceMinor',
  discount: 'discount',
  vat: 'vat',
  vatEnabled: 'vatEnabled',
  costMinor: 'costMinor'
};

exports.Prisma.SalesReturnScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  ownerId: 'ownerId',
  groupId: 'groupId',
  name: 'name',
  code: 'code',
  externalCode: 'externalCode',
  syncId: 'syncId',
  agentId: 'agentId',
  agentAccountId: 'agentAccountId',
  organizationId: 'organizationId',
  organizationAccountId: 'organizationAccountId',
  storeId: 'storeId',
  salesChannelId: 'salesChannelId',
  contractId: 'contractId',
  projectId: 'projectId',
  demandId: 'demandId',
  customerOrderId: 'customerOrderId',
  moment: 'moment',
  applicable: 'applicable',
  state: 'state',
  postedAt: 'postedAt',
  sumMinor: 'sumMinor',
  vatSumMinor: 'vatSumMinor',
  payedSumMinor: 'payedSumMinor',
  vatEnabled: 'vatEnabled',
  vatIncluded: 'vatIncluded',
  currency: 'currency',
  rateValue: 'rateValue',
  reason: 'reason',
  description: 'description',
  shared: 'shared',
  printed: 'printed',
  published: 'published',
  attributes: 'attributes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt',
  version: 'version'
};

exports.Prisma.SalesReturnPositionScalarFieldEnum = {
  id: 'id',
  salesReturnId: 'salesReturnId',
  accountId: 'accountId',
  position: 'position',
  assortmentKind: 'assortmentKind',
  assortmentId: 'assortmentId',
  productId: 'productId',
  demandPositionId: 'demandPositionId',
  quantity: 'quantity',
  priceMinor: 'priceMinor',
  discount: 'discount',
  vat: 'vat',
  vatEnabled: 'vatEnabled',
  costMinor: 'costMinor',
  gtdNumber: 'gtdNumber',
  gtdSumMinor: 'gtdSumMinor',
  countryId: 'countryId'
};

exports.Prisma.PurchaseReturnScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  ownerId: 'ownerId',
  groupId: 'groupId',
  name: 'name',
  code: 'code',
  externalCode: 'externalCode',
  syncId: 'syncId',
  agentId: 'agentId',
  agentAccountId: 'agentAccountId',
  organizationId: 'organizationId',
  organizationAccountId: 'organizationAccountId',
  storeId: 'storeId',
  supplyId: 'supplyId',
  contractId: 'contractId',
  projectId: 'projectId',
  moment: 'moment',
  applicable: 'applicable',
  state: 'state',
  postedAt: 'postedAt',
  sumMinor: 'sumMinor',
  vatSumMinor: 'vatSumMinor',
  payedSumMinor: 'payedSumMinor',
  vatEnabled: 'vatEnabled',
  vatIncluded: 'vatIncluded',
  currency: 'currency',
  rateValue: 'rateValue',
  reason: 'reason',
  description: 'description',
  shared: 'shared',
  printed: 'printed',
  published: 'published',
  attributes: 'attributes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt',
  version: 'version'
};

exports.Prisma.PurchaseReturnPositionScalarFieldEnum = {
  id: 'id',
  purchaseReturnId: 'purchaseReturnId',
  accountId: 'accountId',
  position: 'position',
  assortmentKind: 'assortmentKind',
  assortmentId: 'assortmentId',
  productId: 'productId',
  supplyPositionId: 'supplyPositionId',
  quantity: 'quantity',
  priceMinor: 'priceMinor',
  discount: 'discount',
  vat: 'vat',
  vatEnabled: 'vatEnabled',
  costMinor: 'costMinor'
};

exports.Prisma.MoveScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  ownerId: 'ownerId',
  name: 'name',
  code: 'code',
  externalCode: 'externalCode',
  syncId: 'syncId',
  groupId: 'groupId',
  modifiedById: 'modifiedById',
  organizationId: 'organizationId',
  sourceStoreId: 'sourceStoreId',
  destinationStoreId: 'destinationStoreId',
  customerOrderId: 'customerOrderId',
  demandId: 'demandId',
  supplyId: 'supplyId',
  projectId: 'projectId',
  moment: 'moment',
  applicable: 'applicable',
  state: 'state',
  postedAt: 'postedAt',
  sumMinor: 'sumMinor',
  overheadSumMinor: 'overheadSumMinor',
  overheadDistribution: 'overheadDistribution',
  overheadCurrency: 'overheadCurrency',
  currency: 'currency',
  rateValue: 'rateValue',
  description: 'description',
  shared: 'shared',
  printed: 'printed',
  published: 'published',
  attributes: 'attributes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt',
  version: 'version'
};

exports.Prisma.MovePositionScalarFieldEnum = {
  id: 'id',
  moveId: 'moveId',
  accountId: 'accountId',
  position: 'position',
  assortmentKind: 'assortmentKind',
  assortmentId: 'assortmentId',
  productId: 'productId',
  quantity: 'quantity',
  costMinor: 'costMinor'
};

exports.Prisma.LossScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  ownerId: 'ownerId',
  groupId: 'groupId',
  name: 'name',
  code: 'code',
  externalCode: 'externalCode',
  syncId: 'syncId',
  organizationId: 'organizationId',
  storeId: 'storeId',
  expenseItem: 'expenseItem',
  projectId: 'projectId',
  moment: 'moment',
  applicable: 'applicable',
  state: 'state',
  postedAt: 'postedAt',
  sumMinor: 'sumMinor',
  currency: 'currency',
  rateValue: 'rateValue',
  reason: 'reason',
  description: 'description',
  shared: 'shared',
  printed: 'printed',
  published: 'published',
  attributes: 'attributes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt',
  version: 'version'
};

exports.Prisma.LossPositionScalarFieldEnum = {
  id: 'id',
  lossId: 'lossId',
  accountId: 'accountId',
  position: 'position',
  assortmentKind: 'assortmentKind',
  assortmentId: 'assortmentId',
  productId: 'productId',
  quantity: 'quantity',
  costMinor: 'costMinor',
  reason: 'reason',
  cell: 'cell'
};

exports.Prisma.EnterScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  ownerId: 'ownerId',
  groupId: 'groupId',
  modifiedById: 'modifiedById',
  name: 'name',
  code: 'code',
  externalCode: 'externalCode',
  syncId: 'syncId',
  organizationId: 'organizationId',
  storeId: 'storeId',
  projectId: 'projectId',
  moment: 'moment',
  applicable: 'applicable',
  state: 'state',
  postedAt: 'postedAt',
  sumMinor: 'sumMinor',
  overheadSumMinor: 'overheadSumMinor',
  overheadDistribution: 'overheadDistribution',
  overheadCurrency: 'overheadCurrency',
  currency: 'currency',
  rateValue: 'rateValue',
  reason: 'reason',
  description: 'description',
  shared: 'shared',
  printed: 'printed',
  published: 'published',
  attributes: 'attributes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt',
  version: 'version'
};

exports.Prisma.EnterPositionScalarFieldEnum = {
  id: 'id',
  enterId: 'enterId',
  accountId: 'accountId',
  position: 'position',
  assortmentKind: 'assortmentKind',
  assortmentId: 'assortmentId',
  productId: 'productId',
  quantity: 'quantity',
  costMinor: 'costMinor',
  reason: 'reason',
  gtdNumber: 'gtdNumber',
  gtdSumMinor: 'gtdSumMinor',
  countryId: 'countryId',
  rnpt: 'rnpt',
  cell: 'cell'
};

exports.Prisma.InventoryScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  ownerId: 'ownerId',
  groupId: 'groupId',
  name: 'name',
  code: 'code',
  externalCode: 'externalCode',
  syncId: 'syncId',
  organizationId: 'organizationId',
  storeId: 'storeId',
  projectId: 'projectId',
  moment: 'moment',
  applicable: 'applicable',
  state: 'state',
  postedAt: 'postedAt',
  sumMinor: 'sumMinor',
  description: 'description',
  shared: 'shared',
  printed: 'printed',
  published: 'published',
  attributes: 'attributes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt',
  version: 'version'
};

exports.Prisma.InventoryPositionScalarFieldEnum = {
  id: 'id',
  inventoryId: 'inventoryId',
  accountId: 'accountId',
  position: 'position',
  assortmentKind: 'assortmentKind',
  assortmentId: 'assortmentId',
  productId: 'productId',
  expectedQty: 'expectedQty',
  actualQty: 'actualQty',
  varianceQty: 'varianceQty',
  costMinor: 'costMinor'
};

exports.Prisma.StockOperationScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  storeId: 'storeId',
  assortmentKind: 'assortmentKind',
  assortmentId: 'assortmentId',
  qtyDelta: 'qtyDelta',
  costDeltaMinor: 'costDeltaMinor',
  docType: 'docType',
  docId: 'docId',
  docPositionId: 'docPositionId',
  reason: 'reason',
  occurredAt: 'occurredAt',
  createdById: 'createdById'
};

exports.Prisma.StockReservationScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  storeId: 'storeId',
  assortmentKind: 'assortmentKind',
  assortmentId: 'assortmentId',
  qtyDelta: 'qtyDelta',
  docType: 'docType',
  docId: 'docId',
  reason: 'reason',
  occurredAt: 'occurredAt',
  createdById: 'createdById'
};

exports.Prisma.StockScalarFieldEnum = {
  accountId: 'accountId',
  storeId: 'storeId',
  assortmentKind: 'assortmentKind',
  assortmentId: 'assortmentId',
  qty: 'qty',
  reservedQty: 'reservedQty',
  costBalanceMinor: 'costBalanceMinor',
  updatedAt: 'updatedAt'
};

exports.Prisma.InvoiceInScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  ownerId: 'ownerId',
  groupId: 'groupId',
  name: 'name',
  code: 'code',
  externalCode: 'externalCode',
  syncId: 'syncId',
  incomingNumber: 'incomingNumber',
  incomingDate: 'incomingDate',
  agentId: 'agentId',
  agentAccountId: 'agentAccountId',
  organizationId: 'organizationId',
  organizationAccountId: 'organizationAccountId',
  storeId: 'storeId',
  purchaseOrderId: 'purchaseOrderId',
  contractId: 'contractId',
  projectId: 'projectId',
  moment: 'moment',
  paymentPlannedMoment: 'paymentPlannedMoment',
  applicable: 'applicable',
  state: 'state',
  postedAt: 'postedAt',
  sumMinor: 'sumMinor',
  vatSumMinor: 'vatSumMinor',
  payedSumMinor: 'payedSumMinor',
  shippedSumMinor: 'shippedSumMinor',
  vatEnabled: 'vatEnabled',
  vatIncluded: 'vatIncluded',
  currency: 'currency',
  rateValue: 'rateValue',
  description: 'description',
  shared: 'shared',
  printed: 'printed',
  published: 'published',
  attributes: 'attributes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt',
  version: 'version'
};

exports.Prisma.InvoiceInPositionScalarFieldEnum = {
  id: 'id',
  invoiceInId: 'invoiceInId',
  accountId: 'accountId',
  position: 'position',
  assortmentKind: 'assortmentKind',
  assortmentId: 'assortmentId',
  productId: 'productId',
  purchaseOrderPositionId: 'purchaseOrderPositionId',
  quantity: 'quantity',
  priceMinor: 'priceMinor',
  discount: 'discount',
  vat: 'vat',
  vatEnabled: 'vatEnabled'
};

exports.Prisma.AuditLogScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  userId: 'userId',
  entity: 'entity',
  entityId: 'entityId',
  action: 'action',
  fieldChanges: 'fieldChanges',
  context: 'context',
  at: 'at'
};

exports.Prisma.PipelineScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  name: 'name',
  isDefault: 'isDefault',
  archived: 'archived',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  version: 'version'
};

exports.Prisma.PipelineStageScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  pipelineId: 'pipelineId',
  name: 'name',
  position: 'position',
  type: 'type',
  probability: 'probability',
  color: 'color',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.OpportunityScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  number: 'number',
  name: 'name',
  pipelineId: 'pipelineId',
  stageId: 'stageId',
  counterpartyId: 'counterpartyId',
  contactPersonId: 'contactPersonId',
  ownerId: 'ownerId',
  amount: 'amount',
  currency: 'currency',
  probability: 'probability',
  expectedCloseDate: 'expectedCloseDate',
  status: 'status',
  closedAt: 'closedAt',
  source: 'source',
  lostReason: 'lostReason',
  description: 'description',
  archived: 'archived',
  createdAt: 'createdAt',
  version: 'version',
  updatedAt: 'updatedAt'
};

exports.Prisma.AttachmentScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  entity: 'entity',
  entityId: 'entityId',
  uploaderId: 'uploaderId',
  filename: 'filename',
  mime: 'mime',
  sizeBytes: 'sizeBytes',
  content: 'content',
  description: 'description',
  createdAt: 'createdAt'
};

exports.Prisma.EmailConfigScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  provider: 'provider',
  fromName: 'fromName',
  fromEmail: 'fromEmail',
  replyTo: 'replyTo',
  host: 'host',
  port: 'port',
  secure: 'secure',
  username: 'username',
  passwordCipher: 'passwordCipher',
  lastTestedAt: 'lastTestedAt',
  lastTestOk: 'lastTestOk',
  lastTestMsg: 'lastTestMsg',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.EmailLogScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  senderId: 'senderId',
  entity: 'entity',
  entityId: 'entityId',
  toAddresses: 'toAddresses',
  ccAddresses: 'ccAddresses',
  subject: 'subject',
  bodyHtml: 'bodyHtml',
  attachmentIds: 'attachmentIds',
  status: 'status',
  attempt: 'attempt',
  maxAttempts: 'maxAttempts',
  nextRetryAt: 'nextRetryAt',
  attemptedAt: 'attemptedAt',
  errorMsg: 'errorMsg',
  sentAt: 'sentAt',
  createdAt: 'createdAt'
};

exports.Prisma.BillOfMaterialsScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  name: 'name',
  externalCode: 'externalCode',
  productId: 'productId',
  outputQty: 'outputQty',
  standardCostMinor: 'standardCostMinor',
  description: 'description',
  archived: 'archived',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  version: 'version'
};

exports.Prisma.BomComponentScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  bomId: 'bomId',
  productId: 'productId',
  qty: 'qty',
  position: 'position'
};

exports.Prisma.WorkOrderScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  ownerId: 'ownerId',
  name: 'name',
  bomId: 'bomId',
  storeId: 'storeId',
  plannedQty: 'plannedQty',
  producedQty: 'producedQty',
  state: 'state',
  moment: 'moment',
  plannedStartAt: 'plannedStartAt',
  plannedEndAt: 'plannedEndAt',
  startedAt: 'startedAt',
  completedAt: 'completedAt',
  description: 'description',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt',
  version: 'version'
};

exports.Prisma.CashierSessionScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  ownerId: 'ownerId',
  groupId: 'groupId',
  cashierId: 'cashierId',
  cashDeskId: 'cashDeskId',
  storeId: 'storeId',
  organizationId: 'organizationId',
  organizationAccountId: 'organizationAccountId',
  name: 'name',
  code: 'code',
  externalCode: 'externalCode',
  syncId: 'syncId',
  openedAt: 'openedAt',
  closedAt: 'closedAt',
  openingCashMinor: 'openingCashMinor',
  closingCashMinor: 'closingCashMinor',
  expectedCashMinor: 'expectedCashMinor',
  discrepancyMinor: 'discrepancyMinor',
  state: 'state',
  salesCount: 'salesCount',
  salesSumMinor: 'salesSumMinor',
  returnsCount: 'returnsCount',
  returnsSumMinor: 'returnsSumMinor',
  proceedsCashMinor: 'proceedsCashMinor',
  proceedsNoCashMinor: 'proceedsNoCashMinor',
  receivedCashMinor: 'receivedCashMinor',
  receivedNoCashMinor: 'receivedNoCashMinor',
  bankPercent: 'bankPercent',
  bankCommissionMinor: 'bankCommissionMinor',
  qrBankPercent: 'qrBankPercent',
  qrBankCommissionMinor: 'qrBankCommissionMinor',
  vatEnabled: 'vatEnabled',
  vatIncluded: 'vatIncluded',
  description: 'description',
  shared: 'shared',
  printed: 'printed',
  published: 'published',
  attributes: 'attributes',
  smenaId: 'smenaId',
  outOfShiftReason: 'outOfShiftReason',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.RetailSaleScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  ownerId: 'ownerId',
  groupId: 'groupId',
  sessionId: 'sessionId',
  name: 'name',
  code: 'code',
  externalCode: 'externalCode',
  syncId: 'syncId',
  agentId: 'agentId',
  agentAccountId: 'agentAccountId',
  organizationId: 'organizationId',
  organizationAccountId: 'organizationAccountId',
  storeId: 'storeId',
  customerOrderId: 'customerOrderId',
  moment: 'moment',
  state: 'state',
  postedAt: 'postedAt',
  applicable: 'applicable',
  sumMinor: 'sumMinor',
  payedSumMinor: 'payedSumMinor',
  cashAmountMinor: 'cashAmountMinor',
  cardAmountMinor: 'cardAmountMinor',
  terminalAmountMinor: 'terminalAmountMinor',
  noCashSumMinor: 'noCashSumMinor',
  qrSumMinor: 'qrSumMinor',
  advancePaymentSumMinor: 'advancePaymentSumMinor',
  prepaymentCashSumMinor: 'prepaymentCashSumMinor',
  prepaymentNoCashSumMinor: 'prepaymentNoCashSumMinor',
  prepaymentQrSumMinor: 'prepaymentQrSumMinor',
  changeMinor: 'changeMinor',
  vatSumMinor: 'vatSumMinor',
  vatEnabled: 'vatEnabled',
  vatIncluded: 'vatIncluded',
  taxSystem: 'taxSystem',
  currency: 'currency',
  rateValue: 'rateValue',
  refundedFromId: 'refundedFromId',
  description: 'description',
  shared: 'shared',
  printed: 'printed',
  published: 'published',
  attributes: 'attributes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt',
  version: 'version'
};

exports.Prisma.RetailSalePositionScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  retailSaleId: 'retailSaleId',
  productId: 'productId',
  position: 'position',
  quantity: 'quantity',
  priceMinor: 'priceMinor',
  discount: 'discount',
  sumMinor: 'sumMinor'
};

exports.Prisma.SalesChannelScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  ownerId: 'ownerId',
  groupId: 'groupId',
  name: 'name',
  code: 'code',
  externalCode: 'externalCode',
  description: 'description',
  kind: 'kind',
  type: 'type',
  externalRef: 'externalRef',
  settings: 'settings',
  shared: 'shared',
  archived: 'archived',
  lastSyncedAt: 'lastSyncedAt',
  lastSyncOk: 'lastSyncOk',
  lastSyncMsg: 'lastSyncMsg',
  createdAt: 'createdAt',
  version: 'version',
  updatedAt: 'updatedAt'
};

exports.Prisma.OnlineOrderScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  channelId: 'channelId',
  externalOrderId: 'externalOrderId',
  customerName: 'customerName',
  customerPhone: 'customerPhone',
  customerAddress: 'customerAddress',
  sumMinor: 'sumMinor',
  currency: 'currency',
  items: 'items',
  state: 'state',
  customerOrderId: 'customerOrderId',
  receivedAt: 'receivedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AppInstallScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  appKey: 'appKey',
  enabled: 'enabled',
  config: 'config',
  installedAt: 'installedAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ExchangeRateScalarFieldEnum = {
  date: 'date',
  currency: 'currency',
  rate: 'rate',
  source: 'source',
  nominal: 'nominal',
  fetchedAt: 'fetchedAt'
};

exports.Prisma.MxikCodeScalarFieldEnum = {
  code: 'code',
  nameUz: 'nameUz',
  nameRu: 'nameRu',
  nameEn: 'nameEn',
  unitCode: 'unitCode',
  groupCode: 'groupCode',
  classCode: 'classCode',
  source: 'source',
  archived: 'archived',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AttributeMetadataScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  entity: 'entity',
  code: 'code',
  name: 'name',
  type: 'type',
  required: 'required',
  defaultValue: 'defaultValue',
  description: 'description',
  enumOptions: 'enumOptions',
  referenceEntity: 'referenceEntity',
  customEntityId: 'customEntityId',
  position: 'position',
  archived: 'archived',
  shared: 'shared',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ServiceRequestScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  ownerId: 'ownerId',
  groupId: 'groupId',
  name: 'name',
  externalCode: 'externalCode',
  subject: 'subject',
  description: 'description',
  counterpartyId: 'counterpartyId',
  contactPersonId: 'contactPersonId',
  assigneeId: 'assigneeId',
  channel: 'channel',
  priority: 'priority',
  status: 'status',
  dueDate: 'dueDate',
  resolvedAt: 'resolvedAt',
  closedAt: 'closedAt',
  attributes: 'attributes',
  tags: 'tags',
  shared: 'shared',
  archived: 'archived',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt'
};

exports.Prisma.PrintTemplateScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  ownerId: 'ownerId',
  entity: 'entity',
  format: 'format',
  name: 'name',
  description: 'description',
  bodyHtml: 'bodyHtml',
  bodyDocx: 'bodyDocx',
  pageSize: 'pageSize',
  marginTop: 'marginTop',
  marginRight: 'marginRight',
  marginBottom: 'marginBottom',
  marginLeft: 'marginLeft',
  isDefault: 'isDefault',
  enabled: 'enabled',
  archived: 'archived',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt'
};

exports.Prisma.HelpArticleScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  slug: 'slug',
  routeKey: 'routeKey',
  locale: 'locale',
  title: 'title',
  bodyMd: 'bodyMd',
  position: 'position',
  category: 'category',
  tags: 'tags',
  enabled: 'enabled',
  archived: 'archived',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.OnboardingProgressScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  currentStep: 'currentStep',
  completedSteps: 'completedSteps',
  startedAt: 'startedAt',
  completedAt: 'completedAt',
  skippedAt: 'skippedAt',
  startedById: 'startedById'
};

exports.Prisma.SmsConfigScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  provider: 'provider',
  email: 'email',
  passwordCipher: 'passwordCipher',
  senderId: 'senderId',
  token: 'token',
  tokenIssuedAt: 'tokenIssuedAt',
  lastTestedAt: 'lastTestedAt',
  lastTestOk: 'lastTestOk',
  lastTestMsg: 'lastTestMsg',
  enabled: 'enabled',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SmsLogScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  senderId: 'senderId',
  entity: 'entity',
  entityId: 'entityId',
  toPhone: 'toPhone',
  body: 'body',
  status: 'status',
  attempt: 'attempt',
  maxAttempts: 'maxAttempts',
  nextRetryAt: 'nextRetryAt',
  attemptedAt: 'attemptedAt',
  sentAt: 'sentAt',
  providerMessageId: 'providerMessageId',
  errorMsg: 'errorMsg',
  createdAt: 'createdAt'
};

exports.Prisma.EdoConfigScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  stir: 'stir',
  orgNameCyrl: 'orgNameCyrl',
  provider: 'provider',
  apiBaseUrl: 'apiBaseUrl',
  apiTokenCipher: 'apiTokenCipher',
  pfxCipher: 'pfxCipher',
  pfxPassCipher: 'pfxPassCipher',
  testMode: 'testMode',
  lastTestedAt: 'lastTestedAt',
  lastTestOk: 'lastTestOk',
  lastTestMsg: 'lastTestMsg',
  enabled: 'enabled',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.EdoSubmissionScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  sourceEntity: 'sourceEntity',
  sourceEntityId: 'sourceEntityId',
  providerEhfId: 'providerEhfId',
  ehfNumber: 'ehfNumber',
  status: 'status',
  xmlBody: 'xmlBody',
  signatureB64: 'signatureB64',
  signedAt: 'signedAt',
  sentAt: 'sentAt',
  deliveredAt: 'deliveredAt',
  confirmedAt: 'confirmedAt',
  errorMsg: 'errorMsg',
  buyerStir: 'buyerStir',
  providerLog: 'providerLog',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.MarkingConfigScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  stir: 'stir',
  apiBaseUrl: 'apiBaseUrl',
  apiTokenCipher: 'apiTokenCipher',
  testMode: 'testMode',
  lastTestedAt: 'lastTestedAt',
  lastTestOk: 'lastTestOk',
  lastTestMsg: 'lastTestMsg',
  enabled: 'enabled',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.MarkingCodeRecordScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  productId: 'productId',
  variantId: 'variantId',
  code: 'code',
  gtin: 'gtin',
  serial: 'serial',
  status: 'status',
  sourceEntity: 'sourceEntity',
  sourceEntityId: 'sourceEntityId',
  providerLog: 'providerLog',
  errorMsg: 'errorMsg',
  allocatedAt: 'allocatedAt',
  appliedAt: 'appliedAt',
  soldAt: 'soldAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.TelegramConfigScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  botTokenCipher: 'botTokenCipher',
  botUsername: 'botUsername',
  webhookUrl: 'webhookUrl',
  webhookSecret: 'webhookSecret',
  defaultChatId: 'defaultChatId',
  lastTestedAt: 'lastTestedAt',
  lastTestOk: 'lastTestOk',
  lastTestMsg: 'lastTestMsg',
  enabled: 'enabled',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.TelegramOutboxScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  chatId: 'chatId',
  parseMode: 'parseMode',
  text: 'text',
  status: 'status',
  attempt: 'attempt',
  maxAttempts: 'maxAttempts',
  nextRetryAt: 'nextRetryAt',
  attemptedAt: 'attemptedAt',
  sentAt: 'sentAt',
  providerMessageId: 'providerMessageId',
  errorMsg: 'errorMsg',
  createdAt: 'createdAt'
};

exports.Prisma.PaymentGatewayConfigScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  provider: 'provider',
  name: 'name',
  merchantId: 'merchantId',
  credsCipher: 'credsCipher',
  testMode: 'testMode',
  callbackUrl: 'callbackUrl',
  enabled: 'enabled',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PaymentGatewayTxScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  provider: 'provider',
  providerTxId: 'providerTxId',
  sourceEntity: 'sourceEntity',
  sourceEntityId: 'sourceEntityId',
  amountMinor: 'amountMinor',
  status: 'status',
  authorizedAt: 'authorizedAt',
  capturedAt: 'capturedAt',
  refundedAt: 'refundedAt',
  cancelledAt: 'cancelledAt',
  failedAt: 'failedAt',
  providerLog: 'providerLog',
  errorMsg: 'errorMsg',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.BankApiConfigScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  bankCode: 'bankCode',
  stir: 'stir',
  bankAccount: 'bankAccount',
  bankMfo: 'bankMfo',
  apiBaseUrl: 'apiBaseUrl',
  credsCipher: 'credsCipher',
  lastPullAt: 'lastPullAt',
  lastPullOk: 'lastPullOk',
  lastPullMsg: 'lastPullMsg',
  enabled: 'enabled',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.OneCSyncConfigScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  endpointUrl: 'endpointUrl',
  username: 'username',
  passwordCipher: 'passwordCipher',
  direction: 'direction',
  pollIntervalMin: 'pollIntervalMin',
  lastSyncAt: 'lastSyncAt',
  lastSyncOk: 'lastSyncOk',
  lastSyncMsg: 'lastSyncMsg',
  enabled: 'enabled',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.OneCSyncLogScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  direction: 'direction',
  status: 'status',
  counts: 'counts',
  startedAt: 'startedAt',
  finishedAt: 'finishedAt',
  errorMsg: 'errorMsg'
};

exports.Prisma.MarketplaceConfigScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  marketplace: 'marketplace',
  shopName: 'shopName',
  sellerId: 'sellerId',
  apiBaseUrl: 'apiBaseUrl',
  credsCipher: 'credsCipher',
  lastCatalogPushAt: 'lastCatalogPushAt',
  lastOrderPullAt: 'lastOrderPullAt',
  enabled: 'enabled',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.MarketplaceOrderRowScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  marketplace: 'marketplace',
  externalId: 'externalId',
  status: 'status',
  totalMinor: 'totalMinor',
  currency: 'currency',
  rawJson: 'rawJson',
  internalOrderId: 'internalOrderId',
  pulledAt: 'pulledAt'
};

exports.Prisma.HrTaskTemplateScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  title: 'title',
  description: 'description',
  assignedEmployeeId: 'assignedEmployeeId',
  assignedRole: 'assignedRole',
  department: 'department',
  priority: 'priority',
  triggerType: 'triggerType',
  scheduleConfig: 'scheduleConfig',
  eventConfig: 'eventConfig',
  responseType: 'responseType',
  deadlineMinutes: 'deadlineMinutes',
  rewardMinor: 'rewardMinor',
  fineMinor: 'fineMinor',
  checkerId: 'checkerId',
  dependsOnId: 'dependsOnId',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.HrTaskLogScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  templateId: 'templateId',
  taskId: 'taskId',
  employeeId: 'employeeId',
  status: 'status',
  responseText: 'responseText',
  sentAt: 'sentAt',
  answeredAt: 'answeredAt',
  reviewedAt: 'reviewedAt',
  reviewedById: 'reviewedById',
  reviewComment: 'reviewComment',
  telegramMessageId: 'telegramMessageId',
  failReason: 'failReason'
};

exports.Prisma.HrAttendanceScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  employeeId: 'employeeId',
  checkInTime: 'checkInTime',
  checkOutTime: 'checkOutTime',
  editedById: 'editedById',
  editedAt: 'editedAt',
  notes: 'notes',
  createdAt: 'createdAt'
};

exports.Prisma.HrTelegramAccountScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  slot: 'slot',
  phoneNumber: 'phoneNumber',
  apiId: 'apiId',
  apiHashEncrypted: 'apiHashEncrypted',
  sessionEncrypted: 'sessionEncrypted',
  isActive: 'isActive',
  lastConnectedAt: 'lastConnectedAt',
  floodWaitUntil: 'floodWaitUntil',
  createdAt: 'createdAt'
};

exports.Prisma.HrTelegramSessionScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  accountSlot: 'accountSlot',
  key: 'key',
  value: 'value',
  updatedAt: 'updatedAt'
};

exports.Prisma.HrChatHistoryScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  counterpartyId: 'counterpartyId',
  messages: 'messages',
  updatedAt: 'updatedAt'
};

exports.Prisma.HrTelegramOutboxScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  counterpartyId: 'counterpartyId',
  employeeId: 'employeeId',
  toPhone: 'toPhone',
  messageText: 'messageText',
  status: 'status',
  retryCount: 'retryCount',
  nextRetryAt: 'nextRetryAt',
  sentAt: 'sentAt',
  failReason: 'failReason',
  sourceEventType: 'sourceEventType',
  sourceDocId: 'sourceDocId',
  telegramMessageId: 'telegramMessageId',
  sentBySlot: 'sentBySlot',
  createdAt: 'createdAt'
};

exports.Prisma.HrBonusFineLogScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  employeeId: 'employeeId',
  kind: 'kind',
  source: 'source',
  amountMinor: 'amountMinor',
  reason: 'reason',
  employeeName: 'employeeName',
  taskLogId: 'taskLogId',
  ruleId: 'ruleId',
  createdById: 'createdById',
  createdAt: 'createdAt'
};

exports.Prisma.HrBonusFineRuleScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  name: 'name',
  kind: 'kind',
  amountMinor: 'amountMinor',
  condition: 'condition',
  isActive: 'isActive',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt'
};

exports.Prisma.HrSalaryConfigScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  fixWeight: 'fixWeight',
  kpiWeight: 'kpiWeight',
  bonusWeight: 'bonusWeight',
  monthlySalesTarget: 'monthlySalesTarget',
  monthlyKpiBudget: 'monthlyKpiBudget',
  commissionPercent: 'commissionPercent',
  kpiTiers: 'kpiTiers',
  updatedAt: 'updatedAt'
};

exports.Prisma.HrKpiDailyLogScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  employeeId: 'employeeId',
  date: 'date',
  personalSalesMinor: 'personalSalesMinor',
  targetMinor: 'targetMinor',
  achievementPercent: 'achievementPercent',
  createdAt: 'createdAt'
};

exports.Prisma.HrKpiMonthlyScoreScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  employeeId: 'employeeId',
  yearMonth: 'yearMonth',
  totalSalesMinor: 'totalSalesMinor',
  targetMinor: 'targetMinor',
  achievementPercent: 'achievementPercent',
  tierPayoutPercent: 'tierPayoutPercent',
  kpiEarnedMinor: 'kpiEarnedMinor',
  fixComponentMinor: 'fixComponentMinor',
  bonusSumMinor: 'bonusSumMinor',
  fineSumMinor: 'fineSumMinor',
  commissionMinor: 'commissionMinor',
  finalSalaryMinor: 'finalSalaryMinor',
  computedAt: 'computedAt'
};

exports.Prisma.HrEmployeePermissionScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  employeeId: 'employeeId',
  pageKey: 'pageKey',
  section: 'section',
  accessLevel: 'accessLevel'
};

exports.Prisma.HrRoleScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  value: 'value',
  label: 'label',
  isDefault: 'isDefault'
};

exports.Prisma.HrNotificationTemplateScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  docType: 'docType',
  eventType: 'eventType',
  templateText: 'templateText',
  isActive: 'isActive',
  largeSaleMinThreshold: 'largeSaleMinThreshold'
};

exports.Prisma.HrActivityLogScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  actorId: 'actorId',
  action: 'action',
  entityType: 'entityType',
  entityId: 'entityId',
  diff: 'diff',
  createdAt: 'createdAt'
};

exports.Prisma.AnalitikaCountScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  productId: 'productId',
  storeId: 'storeId',
  expectedQty: 'expectedQty',
  kamQty: 'kamQty',
  kopQty: 'kopQty',
  netQty: 'netQty',
  salePriceMinor: 'salePriceMinor',
  status: 'status',
  decision: 'decision',
  counterId: 'counterId',
  countedAt: 'countedAt',
  reviewerId: 'reviewerId',
  reviewedAt: 'reviewedAt',
  reasonCodeId: 'reasonCodeId',
  note: 'note'
};

exports.Prisma.AnalitikaReasonCodeScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  label: 'label',
  active: 'active',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AnalitikaVarianceConfigScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  greenMaxPct: 'greenMaxPct',
  yellowMaxPct: 'yellowMaxPct',
  updatedAt: 'updatedAt'
};

exports.Prisma.AnalitikaOrderScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  number: 'number',
  counterpartyId: 'counterpartyId',
  state: 'state',
  totalMinor: 'totalMinor',
  createdAt: 'createdAt'
};

exports.Prisma.AnalitikaOrderLineScalarFieldEnum = {
  id: 'id',
  orderId: 'orderId',
  accountId: 'accountId',
  productId: 'productId',
  qty: 'qty',
  priceMinor: 'priceMinor',
  sumMinor: 'sumMinor'
};

exports.Prisma.SortOrder = {
  asc: 'asc',
  desc: 'desc'
};

exports.Prisma.NullableJsonNullValueInput = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull
};

exports.Prisma.JsonNullValueInput = {
  JsonNull: Prisma.JsonNull
};

exports.Prisma.QueryMode = {
  default: 'default',
  insensitive: 'insensitive'
};

exports.Prisma.JsonNullValueFilter = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull,
  AnyNull: Prisma.AnyNull
};

exports.Prisma.NullsOrder = {
  first: 'first',
  last: 'last'
};
exports.TaskKind = exports.$Enums.TaskKind = {
  CRM: 'CRM',
  HR: 'HR'
};

exports.Prisma.ModelName = {
  Account: 'Account',
  DocumentSequence: 'DocumentSequence',
  Employee: 'Employee',
  Role: 'Role',
  RolePermission: 'RolePermission',
  EmployeeRole: 'EmployeeRole',
  RefreshToken: 'RefreshToken',
  ApiToken: 'ApiToken',
  Organization: 'Organization',
  Store: 'Store',
  OrganizationAccount: 'OrganizationAccount',
  CashDesk: 'CashDesk',
  ShiftSchedule: 'ShiftSchedule',
  Smena: 'Smena',
  SmenaEmployee: 'SmenaEmployee',
  MoneyOperation: 'MoneyOperation',
  BankStatement: 'BankStatement',
  BankStatementRow: 'BankStatementRow',
  CounterpartyBalance: 'CounterpartyBalance',
  CashIn: 'CashIn',
  CashInOperation: 'CashInOperation',
  CashOut: 'CashOut',
  CashOutOperation: 'CashOutOperation',
  ProductImage: 'ProductImage',
  BundleComponent: 'BundleComponent',
  Variant: 'Variant',
  Characteristic: 'Characteristic',
  Call: 'Call',
  CounterpartyNote: 'CounterpartyNote',
  Task: 'Task',
  TaskType: 'TaskType',
  Notification: 'Notification',
  RestockTask: 'RestockTask',
  SkladKeeper: 'SkladKeeper',
  RestockTaskLine: 'RestockTaskLine',
  ContactPerson: 'ContactPerson',
  PriceType: 'PriceType',
  ProductFolder: 'ProductFolder',
  Counterparty: 'Counterparty',
  Group: 'Group',
  CounterpartyGroup: 'CounterpartyGroup',
  CounterpartyAccount: 'CounterpartyAccount',
  State: 'State',
  BonusProgram: 'BonusProgram',
  Country: 'Country',
  Region: 'Region',
  Currency: 'Currency',
  Uom: 'Uom',
  TaxRate: 'TaxRate',
  ExpenseItem: 'ExpenseItem',
  CustomEntity: 'CustomEntity',
  CustomEntityValue: 'CustomEntityValue',
  Project: 'Project',
  SavedFilter: 'SavedFilter',
  Contract: 'Contract',
  CompanySettings: 'CompanySettings',
  UserSettings: 'UserSettings',
  Webhook: 'Webhook',
  WebhookDelivery: 'WebhookDelivery',
  WebhookStock: 'WebhookStock',
  Consignment: 'Consignment',
  BonusOperation: 'BonusOperation',
  Discount: 'Discount',
  TrackingCode: 'TrackingCode',
  Prepayment: 'Prepayment',
  PrepaymentReturn: 'PrepaymentReturn',
  InternalOrder: 'InternalOrder',
  InternalOrderPosition: 'InternalOrderPosition',
  CounterpartyAdjustment: 'CounterpartyAdjustment',
  PriceList: 'PriceList',
  RetailDrawerCashIn: 'RetailDrawerCashIn',
  RetailDrawerCashOut: 'RetailDrawerCashOut',
  RetailSalesReturn: 'RetailSalesReturn',
  RetailStore: 'RetailStore',
  ProcessingProcess: 'ProcessingProcess',
  ProcessingStage: 'ProcessingStage',
  ProcessingStagePerformer: 'ProcessingStagePerformer',
  ProcessingProcessPosition: 'ProcessingProcessPosition',
  ProcessingProcessPositionEdge: 'ProcessingProcessPositionEdge',
  ProcessingPlanFolder: 'ProcessingPlanFolder',
  Production: 'Production',
  ProcessingOrder: 'ProcessingOrder',
  Processing: 'Processing',
  ProcessingMaterial: 'ProcessingMaterial',
  ProcessingProduct: 'ProcessingProduct',
  Payroll: 'Payroll',
  LabelTemplate: 'LabelTemplate',
  LabelPrintJob: 'LabelPrintJob',
  Publication: 'Publication',
  PayrollLine: 'PayrollLine',
  FactureOut: 'FactureOut',
  FactureOutDemand: 'FactureOutDemand',
  FactureIn: 'FactureIn',
  FactureInSupply: 'FactureInSupply',
  CommissionReportOut: 'CommissionReportOut',
  CommissionReportIn: 'CommissionReportIn',
  EmissionOrder: 'EmissionOrder',
  MarkingCodeOrder: 'MarkingCodeOrder',
  RetireOrder: 'RetireOrder',
  Product: 'Product',
  ProductLocation: 'ProductLocation',
  ProductAnalog: 'ProductAnalog',
  ProductPack: 'ProductPack',
  CustomerOrder: 'CustomerOrder',
  CustomerOrderPosition: 'CustomerOrderPosition',
  InvoiceOut: 'InvoiceOut',
  InvoiceOutPosition: 'InvoiceOutPosition',
  Supply: 'Supply',
  SupplyPosition: 'SupplyPosition',
  PurchaseOrder: 'PurchaseOrder',
  PurchaseOrderPosition: 'PurchaseOrderPosition',
  PaymentIn: 'PaymentIn',
  PaymentInOperation: 'PaymentInOperation',
  PaymentOut: 'PaymentOut',
  PaymentOutOperation: 'PaymentOutOperation',
  Demand: 'Demand',
  DemandPositionCostConsumption: 'DemandPositionCostConsumption',
  DemandPosition: 'DemandPosition',
  SalesReturn: 'SalesReturn',
  SalesReturnPosition: 'SalesReturnPosition',
  PurchaseReturn: 'PurchaseReturn',
  PurchaseReturnPosition: 'PurchaseReturnPosition',
  Move: 'Move',
  MovePosition: 'MovePosition',
  Loss: 'Loss',
  LossPosition: 'LossPosition',
  Enter: 'Enter',
  EnterPosition: 'EnterPosition',
  Inventory: 'Inventory',
  InventoryPosition: 'InventoryPosition',
  StockOperation: 'StockOperation',
  StockReservation: 'StockReservation',
  Stock: 'Stock',
  InvoiceIn: 'InvoiceIn',
  InvoiceInPosition: 'InvoiceInPosition',
  AuditLog: 'AuditLog',
  Pipeline: 'Pipeline',
  PipelineStage: 'PipelineStage',
  Opportunity: 'Opportunity',
  Attachment: 'Attachment',
  EmailConfig: 'EmailConfig',
  EmailLog: 'EmailLog',
  BillOfMaterials: 'BillOfMaterials',
  BomComponent: 'BomComponent',
  WorkOrder: 'WorkOrder',
  CashierSession: 'CashierSession',
  RetailSale: 'RetailSale',
  RetailSalePosition: 'RetailSalePosition',
  SalesChannel: 'SalesChannel',
  OnlineOrder: 'OnlineOrder',
  AppInstall: 'AppInstall',
  ExchangeRate: 'ExchangeRate',
  MxikCode: 'MxikCode',
  AttributeMetadata: 'AttributeMetadata',
  ServiceRequest: 'ServiceRequest',
  PrintTemplate: 'PrintTemplate',
  HelpArticle: 'HelpArticle',
  OnboardingProgress: 'OnboardingProgress',
  SmsConfig: 'SmsConfig',
  SmsLog: 'SmsLog',
  EdoConfig: 'EdoConfig',
  EdoSubmission: 'EdoSubmission',
  MarkingConfig: 'MarkingConfig',
  MarkingCodeRecord: 'MarkingCodeRecord',
  TelegramConfig: 'TelegramConfig',
  TelegramOutbox: 'TelegramOutbox',
  PaymentGatewayConfig: 'PaymentGatewayConfig',
  PaymentGatewayTx: 'PaymentGatewayTx',
  BankApiConfig: 'BankApiConfig',
  OneCSyncConfig: 'OneCSyncConfig',
  OneCSyncLog: 'OneCSyncLog',
  MarketplaceConfig: 'MarketplaceConfig',
  MarketplaceOrderRow: 'MarketplaceOrderRow',
  HrTaskTemplate: 'HrTaskTemplate',
  HrTaskLog: 'HrTaskLog',
  HrAttendance: 'HrAttendance',
  HrTelegramAccount: 'HrTelegramAccount',
  HrTelegramSession: 'HrTelegramSession',
  HrChatHistory: 'HrChatHistory',
  HrTelegramOutbox: 'HrTelegramOutbox',
  HrBonusFineLog: 'HrBonusFineLog',
  HrBonusFineRule: 'HrBonusFineRule',
  HrSalaryConfig: 'HrSalaryConfig',
  HrKpiDailyLog: 'HrKpiDailyLog',
  HrKpiMonthlyScore: 'HrKpiMonthlyScore',
  HrEmployeePermission: 'HrEmployeePermission',
  HrRole: 'HrRole',
  HrNotificationTemplate: 'HrNotificationTemplate',
  HrActivityLog: 'HrActivityLog',
  AnalitikaCount: 'AnalitikaCount',
  AnalitikaReasonCode: 'AnalitikaReasonCode',
  AnalitikaVarianceConfig: 'AnalitikaVarianceConfig',
  AnalitikaOrder: 'AnalitikaOrder',
  AnalitikaOrderLine: 'AnalitikaOrderLine'
};

/**
 * This is a stub Prisma Client that will error at runtime if called.
 */
class PrismaClient {
  constructor() {
    return new Proxy(this, {
      get(target, prop) {
        let message
        const runtime = getRuntime()
        if (runtime.isEdge) {
          message = `PrismaClient is not configured to run in ${runtime.prettyName}. In order to run Prisma Client on edge runtime, either:
- Use Prisma Accelerate: https://pris.ly/d/accelerate
- Use Driver Adapters: https://pris.ly/d/driver-adapters
`;
        } else {
          message = 'PrismaClient is unable to run in this browser environment, or has been bundled for the browser (running in `' + runtime.prettyName + '`).'
        }
        
        message += `
If this is unexpected, please open an issue: https://pris.ly/prisma-prisma-bug-report`

        throw new Error(message)
      }
    })
  }
}

exports.PrismaClient = PrismaClient

Object.assign(exports, Prisma)
