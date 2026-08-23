import { describe, expect, it, vi } from 'vitest';

import { generateSceneContent } from '@/lib/generation/scene-generator';
import type { SceneOutline } from '@/lib/types/generation';

const diagramHtml = `<!DOCTYPE html>
<html>
<head><title>Water Cycle</title></head>
<body>
  <main id="diagram-root">Water cycle diagram</main>
  <script type="application/json" id="widget-config">
    {"type":"diagram","nodes":[{"id":"evaporation","label":"Evaporation"}]}
  </script>
</body>
</html>`;

function diagramOutline(widgetOutline: SceneOutline['widgetOutline']): SceneOutline {
  return {
    id: 'diagram-scene',
    type: 'interactive',
    title: 'Water Cycle',
    description: 'Show how water moves through the cycle.',
    keyPoints: ['Evaporation', 'Condensation'],
    order: 1,
    language: 'en-US',
    widgetType: 'diagram',
    widgetOutline,
  };
}

describe('diagram generation constraints', () => {
  it('includes the bounded node count and prescribed node inventory', async () => {
    const prompts: string[] = [];
    const aiCall = vi.fn(async (_system: string, user: string) => {
      prompts.push(user);
      return prompts.length === 1 ? diagramHtml : JSON.stringify({ actions: [] });
    });

    await generateSceneContent(
      diagramOutline({
        diagramType: 'flowchart',
        nodeCount: 2,
        nodes: [
          {
            id: 'evaporation',
            label: 'Evaporation',
            icon: 'sun',
            details: 'Liquid water becomes vapor.',
          },
          {
            id: 'condensation',
            label: 'Condensation',
            parentId: 'evaporation',
          },
        ],
      }),
      aiCall,
    );

    expect(prompts[0]).toContain('Maximum node count: 2');
    expect(prompts[0]).toContain('Use every prescribed node exactly once.');
    expect(prompts[0]).toContain('"id": "evaporation"');
    expect(prompts[0]).toContain('"parentId": "evaporation"');
    expect(prompts[0]).not.toContain('{{');
  });

  it('omits optional node constraints when the outline does not provide them', async () => {
    const prompts: string[] = [];
    const aiCall = vi.fn(async (_system: string, user: string) => {
      prompts.push(user);
      return prompts.length === 1 ? diagramHtml : JSON.stringify({ actions: [] });
    });

    await generateSceneContent(diagramOutline({ diagramType: 'flowchart' }), aiCall);

    expect(prompts[0]).not.toContain('Node Count Constraint');
    expect(prompts[0]).not.toContain('Prescribed Nodes');
    expect(prompts[0]).not.toContain('{{');
  });
});
