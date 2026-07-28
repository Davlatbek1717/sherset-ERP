import { z } from 'zod';

/**
 * Data Model Schema — Zod schema for Moysklad entity/document JSON files.
 * Validates docs/moysklad-reference/data-model/{entity,document}-schemas/*.json
 *
 * Each file describes one Moysklad API entity (Product, Counterparty, ...) or
 * document type (CustomerOrder, Demand, ...) with their fields, types, and flags.
 */

export const FieldFlagsSchema = z.object({
  required: z.boolean(),
  readOnly: z.boolean(),
  requiredOnCreate: z.boolean(),
  expandable: z.boolean(),
  onDemand: z.boolean(),
  immutableAfterSet: z.boolean(),
  regionTag: z.string().nullable(),
});

export const FieldSchema = z.object({
  name: z.string().min(1, 'Field name cannot be empty'),
  type: z.string().min(1, 'Field type cannot be empty'),
  filtering: z.string().nullable(),
  description: z.string(),
  flags: FieldFlagsSchema,
});

export const TableSchema = z.object({
  heading: z.string().nullable().optional(),
  fields: z.array(FieldSchema).min(1, 'Table must have at least one field'),
});

export const SectionSchema = z.object({
  title: z.string(),
  level: z.number().int().min(1).max(6),
});

export const CrossRefSchema = z
  .object({
    // Loose schema — captured cross-references may have varying shapes
    text: z.string().optional(),
    href: z.string().optional(),
  })
  .passthrough();

export const DataModelSchema = z
  .object({
    slug: z.string().regex(/^[a-z][a-z0-9_-]*$/, 'slug must be lowercase/kebab/snake'),
    title: z.string().min(1, 'title cannot be empty'),
    section: z.string().min(1),
    url: z.string().url().optional(), // optional for manually-written schemas
    source: z.string().optional(), // marks manual entries: "MANUAL — derived from..."
    capturedAt: z.string().min(1),
    sections: z.array(SectionSchema).optional().default([]),
    tables: z.array(TableSchema).min(1, 'Schema must have at least one table'),
    crossRefs: z.array(CrossRefSchema).optional().default([]),
    rawTableCount: z.number().int().min(0).optional(),
    notes: z.string().optional(),
  })
  .superRefine((schema, ctx) => {
    // Field name uniqueness within main table (table[0])
    const mainTable = schema.tables[0];
    if (mainTable) {
      const seen = new Set<string>();
      for (const f of mainTable.fields) {
        if (seen.has(f.name)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Duplicate field name "${f.name}" in main table`,
            path: ['tables', 0, 'fields'],
          });
        }
        seen.add(f.name);
      }
    }

    // If source starts with "MANUAL", url is optional but capturedAt should still be set
    if (schema.source?.startsWith('MANUAL') && !schema.capturedAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Manual schemas must still set capturedAt',
        path: ['capturedAt'],
      });
    }
  });

export type DataModel = z.infer<typeof DataModelSchema>;
export type Field = z.infer<typeof FieldSchema>;
export type Table = z.infer<typeof TableSchema>;
