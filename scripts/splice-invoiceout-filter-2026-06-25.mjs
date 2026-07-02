// One-shot splice: replace the invoices-out InlineFilterPanel children with the
// moysklad invoiceout-filter 24-field layout in exact order (user pixel-1:1 ask).
// Anchors on the panel open-tag testId + the </InlineFilterPanel> close. biome
// formats the emitted JSX afterward.
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = 'apps/web/src/app/(app)/invoices-out/page.tsx';
const src = readFileSync(FILE, 'utf8');

const anchor = 'testId="invoices-out-inline-filter"';
const aIdx = src.indexOf(anchor);
if (aIdx < 0) throw new Error('open anchor not found');
const openGt = src.indexOf('>', aIdx); // the > that closes the open tag
const closeIdx = src.indexOf('</InlineFilterPanel>', openGt);
if (closeIdx < 0) throw new Error('close anchor not found');

// helper builders -----------------------------------------------------------
const periodLabels = `labels={{ yesterday: tFilters('period_yesterday'), today: tFilters('period_today'), week: tFilters('period_week'), month: tFilters('period_month') }}`;

const period = (label, fromExpr, toExpr, setter, testId) => `
            <InlineFilterPanel.Field
              label={${label}}
              inlineSuffix={<PeriodShortcuts onChange={({ from, to }) => { ${setter} }} ${periodLabels} />}
              expandable
            >
              <PeriodInputs from={${fromExpr}} to={${toExpr}} onChange={({ from, to }) => { ${setter} }} testId="${testId}" />
            </InlineFilterPanel.Field>`;

// extFilter picker (label expandable by default; pass exp=false for no bullet)
const extPicker = (label, idKey, labelKey, pickerKey, testId, exp = true, extra = '') => `
            <InlineFilterPanel.Field label={${label}}${exp ? ' expandable' : ' expandable={false}'}>
              <CatalogPickerField
                value={extFilter.${idKey} ? { id: extFilter.${idKey}, label: extFilter.${labelKey} ?? extFilter.${idKey} } : null}
                placeholder=""
                onPick={() => ${extra || `setPickerOpen('${pickerKey}')`}}
                onClear={() => { setExtFilter({ ...extFilter, ${idKey}: undefined, ${labelKey}: undefined }); setCursor(undefined); }}
                testId="${testId}"${extra ? `\n                disabled={!filterValues.organizationId}\n                disabledHint={tFilters('org_account_disabled_hint')}` : ''}
              />
            </InlineFilterPanel.Field>`;

// filterValues picker
const fvPicker = (label, idKey, labelKey, pickerKey, testId) => `
            <InlineFilterPanel.Field label={${label}} expandable>
              <CatalogPickerField
                value={filterValues.${idKey} ? { id: filterValues.${idKey}, label: filterValues.${labelKey} ?? filterValues.${idKey} } : null}
                placeholder=""
                onPick={() => setPickerOpen('${pickerKey}')}
                onClear={() => { setFilterValues({ ...filterValues, ${idKey}: undefined, ${labelKey}: undefined }); setCursor(undefined); }}
                testId="${testId}"
              />
            </InlineFilterPanel.Field>`;

const yesNo = (label, key, testId) => `
            <InlineFilterPanel.Field label={${label}} expandable={false}>
              <YesNoSelect value={extFilter.${key}} onChange={(v) => { setExtFilter({ ...extFilter, ${key}: v }); setCursor(undefined); }} testId="${testId}" />
            </InlineFilterPanel.Field>`;

const children = [
  // 1. Период
  period("tFilters('period')", 'filterValues.momentFrom', 'filterValues.momentTo',
    'setFilterValues({ ...filterValues, momentFrom: from, momentTo: to }); setCursor(undefined);', 'filter-period'),
  // 2. Оплата
  `
            <InlineFilterPanel.Field label={tFilters('payment_status')} expandable={false}>
              <NativeSelect value={extFilter.paymentStatus ?? ''} onChange={(e) => { setExtFilter({ ...extFilter, paymentStatus: (e.target.value || undefined) as 'unpaid' | 'partial' | 'paid' | undefined }); setCursor(undefined); }} data-test-id="filter-payment-status">
                <option value="" />
                <option value="unpaid">{tFilters('payment_unpaid')}</option>
                <option value="partial">{tFilters('payment_partial')}</option>
                <option value="paid">{tFilters('payment_paid')}</option>
              </NativeSelect>
            </InlineFilterPanel.Field>`,
  // 3. Отгружено
  `
            <InlineFilterPanel.Field label={tFilters('shipped_status')} expandable={false}>
              <NativeSelect value={extFilter.shippedStatus ?? ''} onChange={(e) => { setExtFilter({ ...extFilter, shippedStatus: (e.target.value || undefined) as 'not_shipped' | 'partial' | 'shipped' | undefined }); setCursor(undefined); }} data-test-id="filter-shipped-status">
                <option value="" />
                <option value="not_shipped">{tFilters('shipped_unshipped')}</option>
                <option value="partial">{tFilters('shipped_partial')}</option>
                <option value="shipped">{tFilters('shipped_shipped')}</option>
              </NativeSelect>
            </InlineFilterPanel.Field>`,
  // 4. План. дата оплаты
  period("tFields('payment_planned')", 'extFilter.paymentPlannedFrom', 'extFilter.paymentPlannedTo',
    'setExtFilter({ ...extFilter, paymentPlannedFrom: from, paymentPlannedTo: to }); setCursor(undefined);', 'filter-payment-planned'),
  // 5. Товар или группа
  extPicker("tFilters('product_or_group')", 'productId', 'productLabel', 'product', 'filter-product'),
  // 6. Склад
  fvPicker("tFilters('store')", 'storeId', 'storeLabel', 'store', 'filter-store'),
  // 7. Проект
  extPicker("tFilters('project')", 'projectId', 'projectLabel', 'project', 'filter-project'),
  // 8. Контрагент
  fvPicker("tFilters('agent')", 'agentId', 'agentLabel', 'agent', 'filter-agent'),
  // 9. Группа контрагента
  extPicker("tFilters('agent_group')", 'agentGroupId', 'agentGroupLabel', 'agentGroup', 'filter-agent-group'),
  // 10. Счет контрагента (no bullet; needs an agent first)
  extPicker("tFilters('agent_account')", 'agentAccountId', 'agentAccountLabel', 'agentAccount', 'filter-agent-account', false,
    `filterValues.agentId && setPickerOpen('agentAccount')`).replace("disabled={!filterValues.organizationId}", "disabled={!filterValues.agentId}").replace("disabledHint={tFilters('org_account_disabled_hint')}", "disabledHint={tFilters('agent_account_disabled_hint')}"),
  // 11. Договор
  extPicker("tFilters('contract')", 'contractId', 'contractLabel', 'contract', 'filter-contract'),
  // 12. Владелец контрагента
  extPicker("tFilters('agent_owner')", 'agentOwnerId', 'agentOwnerLabel', 'agentOwner', 'filter-agent-owner'),
  // 13. Организация
  fvPicker("tFilters('organization')", 'organizationId', 'organizationLabel', 'org', 'filter-org'),
  // 14. Счет организации (no bullet; disabled until org picked)
  extPicker("tFilters('organization_account')", 'organizationAccountId', 'organizationAccountLabel', 'orgAccount', 'filter-org-account', false,
    `filterValues.organizationId && setPickerOpen('orgAccount')`),
  // 15. Статус
  `
            <InlineFilterPanel.Field label={tFilters('state')} expandable>
              <NativeSelect value={extFilter.state ?? ''} onChange={(e) => { setExtFilter({ ...extFilter, state: e.target.value || undefined }); setCursor(undefined); }} data-test-id="filter-state">
                <option value="" />
                {['draft', 'posted', 'sent', 'partially_paid', 'paid', 'overdue', 'cancelled'].map((s) => (
                  <option key={s} value={s}>{tStates(s)}</option>
                ))}
              </NativeSelect>
            </InlineFilterPanel.Field>`,
  // 16. Проведено
  yesNo("tFilters('applicable')", 'applicable', 'filter-applicable'),
  // 17. Напечатано
  yesNo("tFilters('printed')", 'printed', 'filter-printed'),
  // 18. Отправлено
  yesNo("tFilters('published')", 'published', 'filter-published'),
  // 19. Канал продаж
  extPicker("tFilters('sales_channel')", 'salesChannelId', 'salesChannelLabel', 'salesChannel', 'filter-sales-channel'),
  // 20. Владелец-сотрудник
  fvPicker("tFilters('owner_employee')", 'ownerId', 'ownerLabel', 'owner', 'filter-owner'),
  // 21. Владелец-отдел
  extPicker("tFilters('owner_group')", 'groupId', 'groupLabel', 'group', 'filter-group'),
  // 22. Общий доступ
  yesNo("tFilters('shared')", 'shared', 'filter-shared'),
  // 23. Когда изменен
  period("tFilters('updated_period')", 'extFilter.updatedFrom', 'extFilter.updatedTo',
    'setExtFilter({ ...extFilter, updatedFrom: from, updatedTo: to }); setCursor(undefined);', 'filter-updated'),
  // 24. Кто изменил (no bullet)
  extPicker("tFilters('modified_by')", 'modifiedById', 'modifiedByLabel', 'modifiedBy', 'filter-modified-by', false),
].join('\n');

const out = src.slice(0, openGt + 1) + '\n' + children + '\n          ' + src.slice(closeIdx);
writeFileSync(FILE, out);
console.log('spliced 24 fields into', FILE);
