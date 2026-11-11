import { DateTime } from 'luxon';

export interface DateRange {
  startUtc: string;
  endUtc: string;
  description: string;
}

export interface TemporalResult {
  hasTemporalReference: boolean;
  dateRange?: DateRange;
  isAmbiguous?: boolean;
  clarificationPrompt?: string;
  extractedEntities: string[];
  normalizedQuery: string;
}

const WEEKDAYS: Record<string, number> = {
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
  sunday: 7,
  sun: 7,
};

const MONTHS: Record<string, number> = {
  january: 1, jan: 1,
  february: 2, feb: 2,
  march: 3, mar: 3,
  april: 4, apr: 4,
  may: 5,
  june: 6, jun: 6,
  july: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sep: 9, sept: 9,
  october: 10, oct: 10,
  november: 11, nov: 11,
  december: 12, dec: 12,
};

/**
 * Resolves temporal expressions relative to the reference instant and configured IANA timezone.
 * All resolved boundaries are returned as UTC ISO strings.
 */
export function interpretTemporalQuery(
  query: string,
  referenceInstant: DateTime | string | Date = DateTime.utc(),
  timezone: string = 'Asia/Kolkata'
): TemporalResult {
  let ref: DateTime;
  if (typeof referenceInstant === 'string') {
    ref = DateTime.fromISO(referenceInstant, { zone: 'utc' }).setZone(timezone);
  } else if (referenceInstant instanceof Date) {
    ref = DateTime.fromJSDate(referenceInstant, { zone: 'utc' }).setZone(timezone);
  } else {
    ref = referenceInstant.setZone(timezone);
  }

  const lower = query.toLowerCase();

  // 1. Check for ambiguous references: e.g. bare "on Tuesday" when today is Tuesday or near it without "last/this"
  const bareWeekdayMatch = lower.match(/\b(on|about)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
  if (bareWeekdayMatch && !lower.includes('last') && !lower.includes('this') && !lower.includes('since')) {
    const targetDayName = bareWeekdayMatch[2].toLowerCase();
    const targetWeekday = WEEKDAYS[targetDayName];
    if (ref.weekday === targetWeekday) {
      return {
        hasTemporalReference: true,
        isAmbiguous: true,
        clarificationPrompt: `Did you mean today (${ref.toFormat('d LLLL yyyy')}) or last ${bareWeekdayMatch[2]} (${ref.minus({ days: 7 }).toFormat('d LLLL yyyy')})?`,
        extractedEntities: extractSimpleEntities(query),
        normalizedQuery: query
      };
    }
  }

  // 2. Explicit date like "on 3 November", "on November 3", "3 November", "3rd November 2024", "2024-11-03"
  const isoMatch = lower.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) {
    const parsed = DateTime.fromISO(isoMatch[0], { zone: timezone });
    if (parsed.isValid) {
      return {
        hasTemporalReference: true,
        dateRange: {
          startUtc: parsed.startOf('day').toUTC().toISO()!,
          endUtc: parsed.endOf('day').toUTC().toISO()!,
          description: parsed.toFormat('yyyy-MM-dd')
        },
        extractedEntities: extractSimpleEntities(query),
        normalizedQuery: query.replace(isoMatch[0], '').trim()
      };
    }
  }

  const dateRegex1 = /\b(?:on\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)(?:\s+(\d{4}))?\b/i;
  const dateRegex2 = /\b(?:on\s+)?(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+(\d{4}))?\b/i;

  let dateMatch = lower.match(dateRegex1);
  let day = 0, month = 0, year = ref.year;

  if (dateMatch) {
    day = parseInt(dateMatch[1], 10);
    month = MONTHS[dateMatch[2].toLowerCase()];
    if (dateMatch[3]) {
      year = parseInt(dateMatch[3], 10);
    } else {
      const candidate = DateTime.fromObject({ year: ref.year, month, day }, { zone: timezone });
      if (candidate > ref) {
        year = ref.year - 1;
      }
    }
  } else {
    dateMatch = lower.match(dateRegex2);
    if (dateMatch) {
      month = MONTHS[dateMatch[1].toLowerCase()];
      day = parseInt(dateMatch[2], 10);
      if (dateMatch[3]) {
        year = parseInt(dateMatch[3], 10);
      } else {
        const candidate = DateTime.fromObject({ year: ref.year, month, day }, { zone: timezone });
        if (candidate > ref) {
          year = ref.year - 1;
        }
      }
    }
  }

  if (dateMatch && day && month) {
    const target = DateTime.fromObject({ year, month, day }, { zone: timezone });
    if (target.isValid) {
      const start = target.startOf('day').toUTC().toISO()!;
      const end = target.endOf('day').toUTC().toISO()!;
      return {
        hasTemporalReference: true,
        dateRange: {
          startUtc: start,
          endUtc: end,
          description: target.toFormat('yyyy-MM-dd')
        },
        extractedEntities: extractSimpleEntities(query),
        normalizedQuery: query.replace(dateMatch[0], '').trim()
      };
    }
  }

  // 3. "since [weekday]" (e.g. "since monday", "since last tuesday")
  const sinceMatch = lower.match(/\bsince\s+(last\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
  if (sinceMatch) {
    const isExplicitLast = Boolean(sinceMatch[1]);
    const dayName = sinceMatch[2].toLowerCase();
    const targetWeekday = WEEKDAYS[dayName];
    let diff = ref.weekday - targetWeekday;
    if (diff < 0) {
      diff += 7;
    }
    if (diff === 0 && isExplicitLast) {
      diff = 7;
    } else if (diff === 0) {
      diff = 0;
    }
    const targetDay = ref.minus({ days: diff });
    const start = targetDay.startOf('day').toUTC().toISO()!;
    const end = ref.endOf('day').toUTC().toISO()!;
    return {
      hasTemporalReference: true,
      dateRange: {
        startUtc: start,
        endUtc: end,
        description: `since ${dayName} (${targetDay.toFormat('yyyy-MM-dd')} to ${ref.toFormat('yyyy-MM-dd')})`
      },
      extractedEntities: extractSimpleEntities(query),
      normalizedQuery: query.replace(sinceMatch[0], '').trim()
    };
  }

  // 4. "last [weekday]" (e.g. "last tuesday", "last monday")
  const lastWeekdayMatch = lower.match(/\blast\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
  if (lastWeekdayMatch) {
    const dayName = lastWeekdayMatch[1].toLowerCase();
    const targetWeekday = WEEKDAYS[dayName];
    let diff = ref.weekday - targetWeekday;
    if (diff <= 0) {
      diff += 7;
    }
    const targetDay = ref.minus({ days: diff });
    const start = targetDay.startOf('day').toUTC().toISO()!;
    const end = targetDay.endOf('day').toUTC().toISO()!;
    return {
      hasTemporalReference: true,
      dateRange: {
        startUtc: start,
        endUtc: end,
        description: `last ${dayName} (${targetDay.toFormat('yyyy-MM-dd')})`
      },
      extractedEntities: extractSimpleEntities(query),
      normalizedQuery: query.replace(lastWeekdayMatch[0], '').trim()
    };
  }

  // 5. "yesterday"
  if (/\byesterday\b/i.test(lower)) {
    const target = ref.minus({ days: 1 });
    const start = target.startOf('day').toUTC().toISO()!;
    const end = target.endOf('day').toUTC().toISO()!;
    return {
      hasTemporalReference: true,
      dateRange: {
        startUtc: start,
        endUtc: end,
        description: `yesterday (${target.toFormat('yyyy-MM-dd')})`
      },
      extractedEntities: extractSimpleEntities(query),
      normalizedQuery: query.replace(/\byesterday\b/gi, '').trim()
    };
  }

  // 6. "earlier this week" / "this week"
  if (/\b(earlier this week|this week)\b/i.test(lower)) {
    const startOfWeek = ref.startOf('week'); // Monday in Luxon
    const start = startOfWeek.startOf('day').toUTC().toISO()!;
    const end = ref.endOf('day').toUTC().toISO()!;
    return {
      hasTemporalReference: true,
      dateRange: {
        startUtc: start,
        endUtc: end,
        description: `this week (${startOfWeek.toFormat('yyyy-MM-dd')} to ${ref.toFormat('yyyy-MM-dd')})`
      },
      extractedEntities: extractSimpleEntities(query),
      normalizedQuery: query.replace(/\b(earlier this week|this week)\b/gi, '').trim()
    };
  }

  // 7. Bare "today" (only if no explicit past date or relative past date matched)
  if (/\btoday\b/i.test(lower)) {
    const start = ref.startOf('day').toUTC().toISO()!;
    const end = ref.endOf('day').toUTC().toISO()!;
    return {
      hasTemporalReference: true,
      dateRange: {
        startUtc: start,
        endUtc: end,
        description: `today (${ref.toFormat('yyyy-MM-dd')})`
      },
      extractedEntities: extractSimpleEntities(query),
      normalizedQuery: query.replace(/\btoday\b/gi, '').trim()
    };
  }

  return {
    hasTemporalReference: false,
    extractedEntities: extractSimpleEntities(query),
    normalizedQuery: query
  };
}

/**
 * Extracts candidate entities (quoted strings, common capitalized acronyms/tech names, or nouns).
 */
export function extractSimpleEntities(text: string): string[] {
  const entities = new Set<string>();

  // Quoted phrases
  const quotes = text.match(/"([^"]+)"|'([^']+)'/g);
  if (quotes) {
    for (const q of quotes) {
      const clean = q.replace(/^["']|["']$/g, '').trim();
      if (clean.length > 1) entities.add(clean);
    }
  }

  // Key known entities & capitalized terms (e.g. Postgres, Supabase, Neon, HubSpot, Salesforce, CRM, Linear)
  const candidatePatterns = [
    /\b(Postgres|PostgreSQL|Supabase|Neon|Render|Railway|AWS RDS|Heroku)\b/gi,
    /\b(HubSpot|Salesforce|Pipedrive|Zoho|Copper|Close|Freshsales)\b/gi,
    /\b(CRM|ERP|API|SaaS)\b/g,
    /\b([A-Z][a-z0-9]+(?:\s+[A-Z][a-z0-9]+)*)\b/g
  ];

  for (const pat of candidatePatterns) {
    const matches = text.match(pat);
    if (matches) {
      for (const m of matches) {
        const trimmed = m.trim();
        if (!['What', 'When', 'Where', 'Why', 'How', 'Did', 'Does', 'Has', 'Have', 'Is', 'Are', 'Can', 'Could', 'Last', 'Next', 'Since', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'November', 'December', 'January'].includes(trimmed)) {
          entities.add(trimmed);
        }
      }
    }
  }

  return Array.from(entities);
}
