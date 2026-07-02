// moysklad custom-attribute («Дополнительные поля») reference helpers.
//
// A reference-type attr (e.g. «Усто» → a counterparty) renders as an entity PICKER and
// stores a denormalized { id, name }. Two representations coexist and both must work:
//   • moysklad's API names the type by the target entity directly: type='counterparty'.
//   • our admin UI (Настройки → Дополнительные поля) creates type='reference' +
//     referenceEntity='Counterparty'.
export const ATTR_REFERENCE_ENDPOINTS: Record<string, string> = {
  counterparty: '/counterparties',
  product: '/products',
  employee: '/employees',
  project: '/projects',
  organization: '/organizations',
  store: '/stores',
  contract: '/contracts',
};

/**
 * The /reference search endpoint for a reference-type custom attr, or null when it's a
 * scalar (string/text/number/date/enum/…) — in which case render a plain input/dropdown.
 * Accepts both the moysklad type-name and the native reference+referenceEntity forms.
 */
export function attrReferenceEndpoint(attr: {
  type: string;
  referenceEntity?: string | null;
}): string | null {
  const byType = ATTR_REFERENCE_ENDPOINTS[attr.type];
  if (byType) return byType;
  if (attr.type === 'reference' && attr.referenceEntity) {
    return ATTR_REFERENCE_ENDPOINTS[attr.referenceEntity.toLowerCase()] ?? null;
  }
  return null;
}
