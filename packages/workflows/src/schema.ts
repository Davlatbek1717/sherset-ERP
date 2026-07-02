import { z } from 'zod';

/**
 * FSM JSON Schema — Zod mirror of docs/moysklad-reference/workflows/_state-schema.md
 *
 * Every docs/moysklad-reference/workflows/<entity>.json file MUST validate
 * against this schema. Enforced in CI via `pnpm --filter @moysklad/workflows validate`.
 */

const snakeCase = /^[a-z][a-z0-9_]*$/;

export const StateSchema = z.object({
  id: z.string().regex(snakeCase, 'State id must be snake_case'),
  label: z.string().min(1, 'State label cannot be empty'),
  color: z.enum(['gray', 'blue', 'green', 'orange', 'red', 'yellow', 'purple']),
  default: z.boolean().optional(),
  description: z.string().optional(),
  terminal: z.boolean().optional(),
});

export type State = z.infer<typeof StateSchema>;

const FromField = z.union([
  z.string(), // single state id, "all", or "(none)"
  z
    .array(z.string())
    .min(1), // multiple allowed source states
]);

export const TransitionSchema = z.object({
  id: z.string().regex(snakeCase, 'Transition id must be snake_case'),
  from: FromField,
  to: z.string().min(1),
  label: z.string().min(1),
  triggerKind: z.enum(['button', 'derived-document', 'scheduled', 'system', 'auto', 'webhook']),
  triggerName: z.string().optional(),
  preconditions: z.array(z.string()).optional(),
  sideEffects: z.array(z.string()).optional(),
  permissions: z.array(z.string()).optional(),
  reversible: z.boolean().optional(),
  reversalId: z.string().optional(),
});

export type Transition = z.infer<typeof TransitionSchema>;

export const FsmSchema = z
  .object({
    document: z.string().regex(/^[A-Z][a-zA-Z]+$/, 'Document name must be PascalCase'),
    title: z.string().min(1),
    entitySlug: z.string().regex(/^[a-z][a-z0-9_-]*$/, 'entitySlug must be lowercase/kebab'),
    defaultStateName: z.string().min(1),
    states: z.array(StateSchema).min(2, 'Must have at least 2 states'),
    transitions: z.array(TransitionSchema),
    guards: z.array(z.string()).optional(),
    notes: z.string().optional(),
  })
  .superRefine((fsm, ctx) => {
    const stateIds = new Set(fsm.states.map((s) => s.id));

    // defaultStateName must match a declared state
    if (!stateIds.has(fsm.defaultStateName)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `defaultStateName "${fsm.defaultStateName}" not in states[]`,
        path: ['defaultStateName'],
      });
    }

    // Exactly one state should have default:true, matching defaultStateName
    const defaults = fsm.states.filter((s) => s.default);
    if (defaults.length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `More than one state marked default:true (${defaults.map((s) => s.id).join(', ')})`,
        path: ['states'],
      });
    } else if (defaults.length === 1 && defaults[0]!.id !== fsm.defaultStateName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Default state "${defaults[0]!.id}" does not match defaultStateName "${fsm.defaultStateName}"`,
        path: ['states'],
      });
    }

    // Every transition's `from` (except "(none)" / "all") must be a valid state
    for (const t of fsm.transitions) {
      const fromList = Array.isArray(t.from) ? t.from : t.from.split('|').map((s) => s.trim());
      for (const from of fromList) {
        if (from === '(none)' || from === 'all' || from === '') continue;
        // Also accept pipe-separated (e.g. "draft|posted")
        if (!stateIds.has(from)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Transition "${t.id}" from="${from}" is not a valid state id`,
            path: ['transitions'],
          });
        }
      }

      // `to` must be a valid state OR "(soft-deleted)"
      if (t.to !== '(soft-deleted)' && !stateIds.has(t.to)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Transition "${t.id}" to="${t.to}" is not a valid state id`,
          path: ['transitions'],
        });
      }

      // If reversible, reversalId should point to another transition (or "(auto")"
      if (t.reversible && !t.reversalId) {
        // soft-warn via info only — not every reversible needs named reversal
      }
    }

    // Transition ids must be unique
    const transitionIds = fsm.transitions.map((t) => t.id);
    const duplicates = transitionIds.filter((id, idx) => transitionIds.indexOf(id) !== idx);
    if (duplicates.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate transition ids: ${[...new Set(duplicates)].join(', ')}`,
        path: ['transitions'],
      });
    }
  });

export type Fsm = z.infer<typeof FsmSchema>;
