export interface FactValue {
  entity: string;
  topic: string;
  plan?: string;
  attribute: string;
  value: string;
  unit?: string;
  currency?: string;
  billingPeriod?: string; // 'monthly' | 'annually' | 'one-time'
  seats?: number;
  region?: string;
  sourceUrl?: string;
  publishedAt?: string | null;
  observedAt: string;
}

export type ComparisonStatus =
  | 'changed'
  | 'unchanged based on checked evidence'
  | 'inconclusive'
  | 'not found';

export interface ComparisonResult {
  entity: string;
  attribute: string;
  status: ComparisonStatus;
  baseline: FactValue | null;
  current: FactValue | null;
  explanation: string;
  citationUrl?: string;
}

/**
 * Sanitizes untrusted web content to neutralize potential prompt injections.
 */
export function sanitizeWebContent(raw: string): string {
  if (!raw) return '';
  // Neutralize common prompt injection patterns
  return raw
    .replace(/(?:system\s*prompt|system\s*instruction|ignore\s+all\s+previous\s+instructions)/gi, '[REDACTED_INSTRUCTION]')
    .replace(/(?:you\s+are\s+now|developer\s+mode|administrative\s+override)/gi, '[REDACTED_COMMAND]');
}

/**
 * Evaluates multiple sources for an entity to detect contradictions.
 */
export function evaluateMultipleSources(
  sources: FactValue[]
): { hasConflict: boolean; status: ComparisonStatus; explanation: string } {
  if (sources.length <= 1) {
    return {
      hasConflict: false,
      status: 'unchanged based on checked evidence',
      explanation: 'Single or consistent source verified.'
    };
  }

  const first = sources[0];
  const conflict = sources.find(
    (s) => s.value.trim().toLowerCase() !== first.value.trim().toLowerCase()
  );

  if (conflict) {
    return {
      hasConflict: true,
      status: 'inconclusive',
      explanation: `Contradictory sources detected: ${first.sourceUrl || 'Source A'} reports ${first.value}${first.currency ? ' ' + first.currency : ''}, whereas ${conflict.sourceUrl || 'Source B'} reports ${conflict.value}${conflict.currency ? ' ' + conflict.currency : ''}. The evidence is conflicting and cannot be reconciled without authoritative primary verification.`
    };
  }

  return {
    hasConflict: false,
    status: 'unchanged based on checked evidence',
    explanation: 'All checked sources report consistent values.'
  };
}
export function compareFactsLikeForLike(
  baseline: FactValue | null,
  current: FactValue | null
): ComparisonResult {
  if (!baseline) {
    return {
      entity: current?.entity || 'Unknown',
      attribute: current?.attribute || 'pricing/features',
      status: 'not found',
      baseline: null,
      current,
      explanation: `Historical baseline is missing in memory. Cannot establish if this has changed since a prior discussion.`
    };
  }

  if (!current) {
    return {
      entity: baseline.entity,
      attribute: baseline.attribute,
      status: 'not found',
      baseline,
      current: null,
      explanation: `No verified current primary source evidence found for ${baseline.entity}. Cannot conclude if changed or unchanged.`
    };
  }

  // Check currency matching
  if (baseline.currency && current.currency && baseline.currency.toUpperCase() !== current.currency.toUpperCase()) {
    return {
      entity: baseline.entity,
      attribute: baseline.attribute,
      status: 'inconclusive',
      baseline,
      current,
      citationUrl: current.sourceUrl,
      explanation: `Inconclusive comparison: Baseline currency was ${baseline.currency} but current source reports ${current.currency}. Cannot compare unlike currencies directly without conversion terms.`
    };
  }

  // Check billing period matching
  if (baseline.billingPeriod && current.billingPeriod && baseline.billingPeriod.toLowerCase() !== current.billingPeriod.toLowerCase()) {
    return {
      entity: baseline.entity,
      attribute: baseline.attribute,
      status: 'inconclusive',
      baseline,
      current,
      citationUrl: current.sourceUrl,
      explanation: `Inconclusive comparison: Baseline was billed ${baseline.billingPeriod} but current source reports ${current.billingPeriod}. Like-for-like comparison requires matching billing cycles.`
    };
  }

  // Check seat or plan mismatch if specified
  if (baseline.seats && current.seats && baseline.seats !== current.seats) {
    return {
      entity: baseline.entity,
      attribute: baseline.attribute,
      status: 'inconclusive',
      baseline,
      current,
      citationUrl: current.sourceUrl,
      explanation: `Inconclusive comparison: Baseline was evaluated for ${baseline.seats} seats but current evidence specifies ${current.seats} seats.`
    };
  }

  // Normalize numerical values for comparison
  const normBase = baseline.value.replace(/[^0-9.]/g, '');
  const normCurr = current.value.replace(/[^0-9.]/g, '');

  if (normBase && normCurr && parseFloat(normBase) !== parseFloat(normCurr)) {
    return {
      entity: baseline.entity,
      attribute: baseline.attribute,
      status: 'changed',
      baseline,
      current,
      citationUrl: current.sourceUrl,
      explanation: `Changed: Previously recorded as ${baseline.value}${baseline.unit ? ' ' + baseline.unit : ''} (${baseline.billingPeriod || ''}), but current primary source indicates ${current.value}${current.unit ? ' ' + current.unit : ''} (${current.billingPeriod || ''}).`
    };
  }

  // If text values match or numeric values match
  if (baseline.value.trim().toLowerCase() === current.value.trim().toLowerCase() || (normBase && normCurr && parseFloat(normBase) === parseFloat(normCurr))) {
    return {
      entity: baseline.entity,
      attribute: baseline.attribute,
      status: 'unchanged based on checked evidence',
      baseline,
      current,
      citationUrl: current.sourceUrl,
      explanation: `Unchanged based on checked evidence: Both baseline and current primary source report ${current.value}${current.unit ? ' ' + current.unit : ''} (${current.billingPeriod || 'same period'}).`
    };
  }

  return {
    entity: baseline.entity,
    attribute: baseline.attribute,
    status: 'changed',
    baseline,
    current,
    citationUrl: current.sourceUrl,
    explanation: `Changed: Baseline value "${baseline.value}" differs from current verified value "${current.value}".`
  };
}
