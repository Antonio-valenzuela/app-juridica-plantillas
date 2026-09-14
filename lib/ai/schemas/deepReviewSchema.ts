import { z } from "zod";

export const deepReviewSchema = z.object({
  summary: z.string().default("Revisión profunda multimodelo completada."),
  overallRisk: z.enum(["critical", "high", "medium", "low"]).default("low"),
  issues: z
    .array(
      z.object({
        id: z.string(),
        severity: z.enum(["critical", "warning", "suggestion"]).default("suggestion"),
        section: z.string().default("general"),
        fieldId: z.string().nullable().optional(),
        title: z.string(),
        explanation: z.string(),
        currentText: z.string().nullable().optional(),
        suggestedText: z.string().nullable().optional(),
        supportedBySources: z.boolean().default(true),
        sourceIds: z.array(z.string()).default([]),
        modelAgreement: z.enum(["both", "nvidia_only", "gemini_only", "groq_only", "judge_added"]).default("both"),
        confidence: z.number().min(0).max(1).default(0.8),
      })
    )
    .default([]),
  missingFields: z.array(z.string()).default([]),
  contradictions: z.array(z.string()).default([]),
  unsupportedClaims: z.array(z.string()).default([]),
  recommendedActions: z.array(z.string()).default([]),
  sourcesUsed: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        officialUrl: z.string().default(""),
        sourceType: z
          .enum(["legislation", "jurisprudence", "official_publication"])
          .default("legislation"),
        verified: z.boolean().default(true),
      })
    )
    .default([]),
  providerSummary: z
    .object({
      nvidiaCompleted: z.boolean().default(false),
      geminiCompleted: z.boolean().default(false),
      groqCompleted: z.boolean().default(false),
      judgeCompleted: z.boolean().default(false),
      fallbackUsed: z.boolean().default(false),
    })
    .default({
      nvidiaCompleted: false,
      geminiCompleted: false,
      groqCompleted: false,
      judgeCompleted: false,
      fallbackUsed: false,
    }),
});

export type DeepReviewOutput = z.infer<typeof deepReviewSchema>;
