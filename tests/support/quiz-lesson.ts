import type { Scene, Stage } from '@/lib/types/stage';

export function quizLesson() {
  const stage: Stage = {
    id: 'quiz-key-room',
    name: 'Vector checkpoint',
    createdAt: 1,
    updatedAt: 1,
  };
  const scenes: Scene[] = [
    {
      id: 'quiz-key-scene',
      stageId: stage.id,
      type: 'quiz',
      title: 'Vector checkpoint',
      order: 0,
      createdAt: 1,
      updatedAt: 1,
      content: {
        type: 'quiz',
        questions: [
          {
            id: 'vector',
            type: 'single',
            question: '(2, 3) + (4, -1) = ?',
            options: [
              { value: 'A', label: '(6, 2)' },
              { value: 'B', label: '(2, -4)' },
            ],
            answer: ['(6, 2)'],
            points: 2,
            analysis: 'Add matching coordinates: 2 + 4 = 6 and 3 - 1 = 2.',
          },
          {
            id: 'ambiguous',
            type: 'single',
            question: 'A legacy question awaiting teacher review',
            options: [
              { value: 'A', label: 'same' },
              { value: 'B', label: 'same' },
            ],
            answer: ['same'],
            points: 5,
          },
        ],
      },
    },
  ];
  return { id: stage.id, ownerUserId: 'teacher-1', organizationId: 'org-1', stage, scenes };
}
