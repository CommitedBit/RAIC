import type { PPTLatexElement, Slide } from '@/lib/types/slides';
import type { Scene, Stage } from '@/lib/types/stage';

export const UNSAFE_FORMULA = '<img src=x onerror="void 0"><span class="katex">x</span>';
export const SAFE_FORMULA = '<span class="katex">x</span>';

export function formulaLesson(html = UNSAFE_FORMULA) {
  const element: PPTLatexElement = {
    id: 'formula',
    type: 'latex',
    latex: 'x',
    html,
    left: 0,
    top: 0,
    width: 200,
    height: 80,
    rotate: 0,
  };
  const canvas: Slide = {
    id: 'canvas',
    viewportSize: 1000,
    viewportRatio: 9 / 16,
    theme: {
      backgroundColor: '#fff',
      themeColors: ['#123456'],
      fontColor: '#000',
      fontName: 'Arial',
    },
    elements: [element],
  };
  const stage: Stage = {
    id: 'formula-room',
    name: 'Formula lesson',
    createdAt: 1,
    updatedAt: 1,
    whiteboard: [structuredClone(canvas)],
  };
  const scenes: Scene[] = [
    {
      id: 'formula-scene',
      stageId: stage.id,
      type: 'slide',
      title: 'Formula',
      order: 0,
      content: { type: 'slide', canvas },
      whiteboards: [structuredClone(canvas)],
      createdAt: 1,
      updatedAt: 1,
    },
  ];
  return { id: stage.id, ownerUserId: 'teacher-1', organizationId: 'org-1', stage, scenes };
}

export function lessonFormulaHtml(lesson: { stage: Stage; scenes: Scene[] }) {
  const scene = lesson.scenes[0];
  if (scene.content.type !== 'slide') throw new Error('Expected fixture slide');
  return [
    (lesson.stage.whiteboard?.[0].elements[0] as PPTLatexElement | undefined)?.html,
    (scene.content.canvas.elements[0] as PPTLatexElement).html,
    (scene.whiteboards?.[0].elements[0] as PPTLatexElement | undefined)?.html,
  ];
}
