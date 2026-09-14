import { z } from 'zod';

export const legalEditOperationSchema = z.object({
  documentId: z.string().optional(),
  sectionId: z.string().optional(),
  operation: z.enum(['replace_text', 'replace_field', 'replace_section', 'insert_after', 'insert_before']),
  target: z.string().min(1),
  replacement: z.string(),
  reason: z.string().optional(),
});

export const legalEditPlanSchema = z.object({
  mode: z.enum(['consulta', 'propuesta', 'edicion']),
  explanation: z.string().default(''),
  operations: z.array(legalEditOperationSchema).default([]),
  warnings: z.array(z.string()).default([]),
});

export type LegalEditPlan = z.infer<typeof legalEditPlanSchema>;
