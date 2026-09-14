type IdentifiedAccidentalTemplateCandidate = {
  id: string;
  sourceFileName: string;
};

type SelectionOptions = {
  sourceFileName: string;
};

/**
 * Selects records only when the caller supplies the exact source identity.
 * The helper is deliberately document-agnostic: no case number or filename
 * is embedded in production code.
 */
export function selectIdentifiedAccidentalTemplate(
  candidates: readonly IdentifiedAccidentalTemplateCandidate[] | null | undefined,
  options: SelectionOptions | null | undefined,
): string[] {
  const sourceFileName = options?.sourceFileName;
  if (!candidates || !sourceFileName) return [];

  return [
    ...new Set(
      candidates
        .filter((candidate) => candidate.sourceFileName === sourceFileName)
        .map((candidate) => candidate.id),
    ),
  ];
}
