import { createDefaultSlideContent } from '@/lib/api/stage-api-defaults';
import type { StageStoreData } from '@/lib/utils/stage-storage';
import type { PPTTextElement, Slide } from '@/lib/types/slides';
import type { Scene } from '@/lib/types/stage';

export const EXAMPLE_COURSE_ID = 'openraic-rit-diff-by-band';
export const EXAMPLE_COURSE_SEED_VERSION = 2;

function buildTextElement(options: {
  readonly id: string;
  readonly content: string;
  readonly top: number;
  readonly height: number;
  readonly textType?: 'title' | 'content';
}): PPTTextElement {
  return {
    type: 'text',
    ...options,
    left: 42,
    width: 916,
    rotate: 0,
    defaultFontName: 'Arial',
    defaultColor: '#1f2937',
    lineHeight: 1.35,
  };
}

function makeSlideCanvas(id: string, title: string, body: string, secondary?: string): Slide {
  const template = createDefaultSlideContent().canvas;
  return {
    ...template,
    id,
    elements: [
      buildTextElement({
        id: `${id}-title`,
        textType: 'title',
        top: 28,
        height: 110,
        content: `<p style="font-size:34px"><strong>${title}</strong></p>`,
      }),
      buildTextElement({
        id: `${id}-body`,
        textType: 'content',
        top: 154,
        height: 260,
        content: body.replace(/<(p|li)>/g, '<$1 style="font-size:24px">'),
      }),
      ...(secondary
        ? [
            buildTextElement({
              id: `${id}-secondary`,
              textType: 'content',
              top: 436,
              height: 92,
              content: `<p style="font-size:21px">${secondary}</p>`,
            }),
          ]
        : []),
    ],
  };
}

const EXAMPLE_SCENES: Scene[] = [
  {
    id: 'openraic-rit-demo-scene-intro',
    stageId: EXAMPLE_COURSE_ID,
    type: 'slide',
    title: 'RIT Input + Grouping Strategy',
    order: 0,
    content: {
      type: 'slide',
      canvas: makeSlideCanvas(
        'openraic-rit-demo-slide-intro',
        'One learning goal. Different amounts of support.',
        '<p><strong>Shared goal:</strong> explain how to solve a two-step problem.</p><p>For this example, use three fictional learners and illustrative bands:</p><ul><li>Alex, 178 → Band A (below 190)</li><li>Bri, 214 → Band B (190–219)</li><li>Kai, 236 → Band C (220 and above)</li></ul>',
        'These thresholds are only for this demo. Teacher judgment and classroom evidence guide real support decisions.',
      ),
    },
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'openraic-rit-demo-scene-prompts',
    stageId: EXAMPLE_COURSE_ID,
    type: 'slide',
    title: 'Differentiated prompt examples',
    order: 1,
    content: {
      type: 'slide',
      canvas: makeSlideCanvas(
        'openraic-rit-demo-slide-prompts',
        'Keep the goal. Adjust the prompt.',
        '<p><strong>Band A:</strong> “Watch one worked example. Then explain the first step before trying the next.”</p><p><strong>Band B:</strong> “Try two varied problems. Explain why you chose each step.”</p><p><strong>Band C:</strong> “Solve a real-life problem. Then create an extension that uses the same idea.”</p>',
        'Worked example: Bri’s 214 falls in Band B. Offer varied practice and ask for a verbal explanation.',
      ),
    },
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'openraic-rit-demo-scene-check',
    stageId: EXAMPLE_COURSE_ID,
    type: 'quiz',
    title: 'Check your understanding',
    order: 2,
    content: {
      type: 'quiz',
      questions: [
        {
          id: 'demo-band-choice',
          type: 'single',
          question: 'Using the demo thresholds, which band contains Bri’s score of 214?',
          options: [
            { value: 'A', label: 'Band A: below 190' },
            { value: 'B', label: 'Band B: 190–219' },
            { value: 'C', label: 'Band C: 220 and above' },
          ],
          answer: ['B'],
          hasAnswer: true,
          points: 1,
          analysis:
            '214 is between 190 and 219, so Bri belongs in Band B for this example. Use varied practice and ask Bri to explain each step.',
        },
        {
          id: 'demo-shared-goal',
          type: 'single',
          question: 'What stays the same across all three support bands?',
          options: [
            { value: 'A', label: 'The shared learning goal' },
            { value: 'B', label: 'The amount of scaffolding' },
            { value: 'C', label: 'Every practice prompt' },
          ],
          answer: ['A'],
          hasAnswer: true,
          points: 1,
          analysis:
            'All learners work toward explaining a two-step solution. The worked examples, prompts, and extensions change to offer different amounts of support.',
        },
      ],
    },
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'openraic-rit-demo-scene-start',
    stageId: EXAMPLE_COURSE_ID,
    type: 'slide',
    title: 'Try it in class',
    order: 3,
    content: {
      type: 'slide',
      canvas: makeSlideCanvas(
        'openraic-rit-demo-slide-start',
        'Plan a small, observable next step.',
        '<ol><li>Choose one learning goal for everyone.</li><li>Prepare a worked example, varied practice, and an extension.</li><li>Use a short checkpoint to decide what support to offer next.</li></ol><p>Review your checkpoint feedback, then finish the lesson to see your results.</p>',
        'This demo uses only fictional information. Your answers and feedback stay in this browser; no AI call is needed to grade them.',
      ),
    },
    createdAt: 0,
    updatedAt: 0,
  },
];

export function buildOpenRaicRitDemoCoursePayload(timestamp?: number): StageStoreData {
  const now = timestamp ?? Date.now();
  return {
    stage: {
      id: EXAMPLE_COURSE_ID,
      name: 'Public Demo: Differentiated Support',
      description:
        'A complete demonstration of differentiated prompts, a local checkpoint, and useful feedback using fictional learners.',
      createdAt: now,
      updatedAt: now,
      learningGoal:
        'Adapt the amount of support while keeping one shared learning goal, then check understanding.',
      language: 'en-US',
      languageDirective: 'Use short, concrete examples and avoid overloading learners.',
      style: 'professional',
      sourceContext: {
        pdfAttached: false,
        tavilyEnabled: false,
        language: 'en-US',
        selectedModel: 'openraic-demo',
        creationMode: 'course',
      },
    },
    scenes: EXAMPLE_SCENES.map((scene) => ({
      ...structuredClone(scene),
      createdAt: now,
      updatedAt: now,
      stageId: EXAMPLE_COURSE_ID,
    })),
    currentSceneId: 'openraic-rit-demo-scene-intro',
    chats: [],
  };
}

export const OPENRAIC_RIT_DEMO_SCENES = EXAMPLE_SCENES;
