import { readFile } from 'node:fs/promises';
import { type Fsm, FsmSchema } from './schema.ts';

export interface ValidationResult {
  file: string;
  ok: boolean;
  errors: { path: string; message: string }[];
  fsm?: Fsm;
}

export async function validateFsmFile(filePath: string): Promise<ValidationResult> {
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

  const result = FsmSchema.safeParse(parsed);
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
    fsm: result.data,
  };
}

export function summarize(results: ValidationResult[]): {
  total: number;
  valid: number;
  invalid: number;
} {
  return {
    total: results.length,
    valid: results.filter((r) => r.ok).length,
    invalid: results.filter((r) => !r.ok).length,
  };
}
