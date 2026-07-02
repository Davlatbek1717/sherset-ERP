import { readFile } from 'node:fs/promises';
import { type DataModel, DataModelSchema } from './data-model-schema.ts';

export interface DataModelValidationResult {
  file: string;
  ok: boolean;
  errors: { path: string; message: string }[];
  schema?: DataModel;
}

export async function validateDataModelFile(filePath: string): Promise<DataModelValidationResult> {
  const raw = await readFile(filePath, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return {
      file: filePath,
      ok: false,
      errors: [{ path: '$', message: `Invalid JSON: ${(e as Error).message}` }],
    };
  }

  const result = DataModelSchema.safeParse(parsed);
  if (!result.success) {
    return {
      file: filePath,
      ok: false,
      errors: result.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      })),
    };
  }

  return {
    file: filePath,
    ok: true,
    errors: [],
    schema: result.data,
  };
}
