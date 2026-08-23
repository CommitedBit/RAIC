import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';

import { buildResourcePackZip } from '@/lib/export/use-export-pptx';
import type { Scene } from '@/lib/types/stage';

const interactiveScene: Scene = {
  id: 'interactive-1',
  stageId: 'stage-1',
  type: 'interactive',
  title: 'Vector/Lab',
  order: 1,
  content: {
    type: 'interactive',
    url: '',
    html: '<!doctype html><html><body>Vector lab</body></html>',
  },
};

describe('buildResourcePackZip', () => {
  it('ships interactive-only classrooms without invoking the PPTX builder', async () => {
    const getPptxBlob = vi.fn(async () => new Blob(['pptx']));
    const result = await buildResourcePackZip([interactiveScene], [], {
      fileName: 'classroom',
      getPptxBlob,
    });

    expect(result.empty).toBe(false);
    expect(result.skippedPptx).toBe(true);
    expect(getPptxBlob).not.toHaveBeenCalled();

    const zip = await JSZip.loadAsync(await result.blob!.arrayBuffer());
    expect(Object.keys(zip.files)).toContain('interactive/01_Vector_Lab.html');
    expect(Object.keys(zip.files).some((name) => name.endsWith('.pptx'))).toBe(false);
  });

  it('preserves a MiroFish notice without requiring slides', async () => {
    const result = await buildResourcePackZip([], [], {
      fileName: 'simulation',
      miroFishNotice: 'Open the governed simulation URL from the classroom.',
      getPptxBlob: vi.fn(async () => new Blob(['pptx'])),
    });

    const zip = await JSZip.loadAsync(await result.blob!.arrayBuffer());
    expect(await zip.file('README-MiroFish.txt')!.async('text')).toContain('governed simulation');
  });

  it('reports an empty pack when no exportable resource exists', async () => {
    const result = await buildResourcePackZip([], [], {
      fileName: 'empty',
      getPptxBlob: vi.fn(async () => new Blob(['pptx'])),
    });

    expect(result).toEqual({ blob: null, skippedPptx: true, empty: true });
  });
});
