import type { AdaptiveGenerationContext } from '@/lib/types/classroom-intelligence';

export interface ReplayScore {
  pass: boolean;
  missing: string[];
  unexpected: string[];
}

export interface PromptReplayExpectation {
  present: string[];
  absent: string[];
}

export const repeatedSessionAdaptiveContext: AdaptiveGenerationContext = {
  requirementFingerprint: 'class-1',
  priorSessions: 1,
  lastCompletedSceneTitle: 'Orbital transfer maneuvers',
  masteryHints: ['transfer windows', 'burn timing'],
  revisitIntent: 'remediate',
  pacingPreference: 'remediate',
  reflectionSummary: 'Spend more time on transfer windows before moving on.',
  confidenceScore: 2,
};

export const adaptivePromptMarkers = {
  header: '## Adaptive Session Context',
  repeatedSession: 'Treat this as a repeated-session classroom',
  lastCompletedSegment: '- Last completed segment: Orbital transfer maneuvers',
  revisitIntent: '- Revisit intent: remediate',
  masteryHints: '- Mastery hints: transfer windows; burn timing',
  reflectionSummary: '- Reflection summary: Spend more time on transfer windows before moving on.',
} as const;

export const repeatedSessionPromptExpectation: PromptReplayExpectation = {
  present: Object.values(adaptivePromptMarkers),
  absent: [],
};

export const noAdaptivePromptExpectation: PromptReplayExpectation = {
  present: [],
  absent: Object.values(adaptivePromptMarkers),
};

export const studentPrivateSentinel = 'STUDENT_PRIVATE_SENTINEL';

export const adaptiveLeakageMarkers = [
  'adaptiveContext',
  'adaptivePrompt',
  'sessionContext',
  'reflectionSummary',
  'requirementFingerprint',
  'masteryHints',
  'analytics',
  'qualitySignals',
  studentPrivateSentinel,
] as const;

function collectLeakageMarkers(
  value: unknown,
  markers: readonly string[],
  found = new Set<string>(),
) {
  if (value == null) {
    return found;
  }

  if (typeof value === 'string') {
    for (const marker of markers) {
      if (value.includes(marker)) {
        found.add(marker);
      }
    }
    return found;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectLeakageMarkers(entry, markers, found);
    }
    return found;
  }

  if (typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      collectLeakageMarkers(key, markers, found);
      collectLeakageMarkers(entry, markers, found);
    }
  }

  return found;
}

export function scoreNoAdaptiveLeakage(value: unknown): ReplayScore {
  const unexpected = Array.from(collectLeakageMarkers(value, adaptiveLeakageMarkers)).sort();

  return {
    pass: unexpected.length === 0,
    missing: [],
    unexpected,
  };
}

export function scorePromptReplay(
  prompt: string | null | undefined,
  expectation: PromptReplayExpectation,
): ReplayScore {
  const source = prompt ?? '';
  const missing = expectation.present.filter((marker) => !source.includes(marker));
  const unexpected = expectation.absent.filter((marker) => source.includes(marker));

  return {
    pass: missing.length === 0 && unexpected.length === 0,
    missing,
    unexpected,
  };
}

export function scoreAdaptiveContextReplay(
  context: AdaptiveGenerationContext | null | undefined,
  mode: 'present' | 'absent',
): ReplayScore {
  const missing: string[] = [];
  const unexpected: string[] = [];

  if (mode === 'absent') {
    if (context) {
      unexpected.push('adaptiveContext');
    }

    return {
      pass: unexpected.length === 0,
      missing,
      unexpected,
    };
  }

  if (!context) {
    return {
      pass: false,
      missing: [
        'adaptiveContext',
        'lastCompletedSceneTitle',
        'masteryHints',
        'revisitIntent',
        'reflectionSummary',
      ],
      unexpected,
    };
  }

  if (context.lastCompletedSceneTitle !== repeatedSessionAdaptiveContext.lastCompletedSceneTitle) {
    missing.push('lastCompletedSceneTitle');
  }

  if (context.revisitIntent !== repeatedSessionAdaptiveContext.revisitIntent) {
    missing.push('revisitIntent');
  }

  if (context.reflectionSummary !== repeatedSessionAdaptiveContext.reflectionSummary) {
    missing.push('reflectionSummary');
  }

  for (const hint of repeatedSessionAdaptiveContext.masteryHints) {
    if (!context.masteryHints.includes(hint)) {
      missing.push(`masteryHint:${hint}`);
    }
  }

  return {
    pass: missing.length === 0,
    missing,
    unexpected,
  };
}
