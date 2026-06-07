import { describe, expect, it } from 'vitest';

import { buildPrompt, processConditionalBlocks } from '@/lib/generation/prompts';
import { PROMPT_IDS } from '@/lib/generation/prompts';
import {
  buildExperiencePresetPromptContext,
  getAvailableExperiencePresetDefinitions,
  getExperiencePresetDefinition,
  GOVERNED_CO_THINKING_PRESET,
  HISTORICAL_VLOGGER_PRESET,
} from '@/lib/generation/experience-presets';
import {
  noAdaptivePromptExpectation,
  repeatedSessionPromptExpectation,
  scorePromptReplay,
} from '../support/adaptive-runtime-replay';

describe('media prompt wiring', () => {
  it('omits disabled image and video instructions from outline prompts', () => {
    const prompt = buildPrompt(PROMPT_IDS.REQUIREMENTS_TO_OUTLINES, {
      requirement: 'Teach photosynthesis',
      language: 'en-US',
      pdfContent: 'None',
      availableImages: 'No images available',
      userProfile: '',
      hasSourceImages: false,
      imageEnabled: false,
      videoEnabled: false,
      mediaEnabled: false,
      researchContext: 'None',
      teacherContext: '',
    });

    expect(prompt?.system).not.toContain('Image generation is available');
    expect(prompt?.system).not.toContain('Video generation is available');
    expect(prompt?.system).not.toContain('Media Safety');
    expect(prompt?.user).not.toContain('Generated media');
  });

  it('includes only the enabled media snippets', () => {
    const prompt = buildPrompt(PROMPT_IDS.REQUIREMENTS_TO_OUTLINES, {
      requirement: 'Teach photosynthesis',
      language: 'en-US',
      pdfContent: 'None',
      availableImages: 'No images available',
      userProfile: '',
      hasSourceImages: false,
      imageEnabled: true,
      videoEnabled: false,
      mediaEnabled: true,
      researchContext: 'None',
      teacherContext: '',
    });

    expect(prompt?.system).toContain('AI-Generated Image Requests');
    expect(prompt?.system).toContain('Content Safety Guidelines');
    expect(prompt?.system).not.toContain('Video generation is available');
  });

  it('injects adaptive replay markers into outline prompts only when provided', () => {
    const adaptivePrompt =
      '## Adaptive Session Context\n' +
      'Treat this as a repeated-session classroom\n' +
      '- Last completed segment: Orbital transfer maneuvers\n' +
      '- Revisit intent: remediate\n' +
      '- Mastery hints: transfer windows; burn timing\n' +
      '- Reflection summary: Spend more time on transfer windows before moving on.';
    const prompt = buildPrompt(PROMPT_IDS.REQUIREMENTS_TO_OUTLINES, {
      requirement: 'Teach orbital mechanics',
      language: 'en-US',
      pdfContent: 'None',
      availableImages: 'No images available',
      userProfile: '',
      hasSourceImages: false,
      imageEnabled: false,
      videoEnabled: false,
      mediaEnabled: false,
      researchContext: 'None',
      teacherContext: '',
      adaptivePrompt,
    });
    const firstRunPrompt = buildPrompt(PROMPT_IDS.REQUIREMENTS_TO_OUTLINES, {
      requirement: 'Teach orbital mechanics',
      language: 'en-US',
      pdfContent: 'None',
      availableImages: 'No images available',
      userProfile: '',
      hasSourceImages: false,
      imageEnabled: false,
      videoEnabled: false,
      mediaEnabled: false,
      researchContext: 'None',
      teacherContext: '',
      adaptivePrompt: '',
    });

    expect(scorePromptReplay(prompt?.user, repeatedSessionPromptExpectation)).toEqual({
      pass: true,
      missing: [],
      unexpected: [],
    });
    expect(scorePromptReplay(firstRunPrompt?.user, noAdaptivePromptExpectation)).toEqual({
      pass: true,
      missing: [],
      unexpected: [],
    });
  });

  it('injects historical-vlogger context only when the preset is selected', () => {
    const baseVariables = {
      requirement: 'Teach the sinking of the Titanic',
      language: 'en-US',
      pdfContent: 'None',
      availableImages: 'No images available',
      userProfile: '',
      hasSourceImages: false,
      imageEnabled: false,
      videoEnabled: false,
      mediaEnabled: false,
      researchContext: 'Source: Encyclopedia entry about RMS Titanic',
      teacherContext: '',
      adaptivePrompt: '',
    };
    const regularPrompt = buildPrompt(PROMPT_IDS.REQUIREMENTS_TO_OUTLINES, baseVariables);
    const presetPrompt = buildPrompt(PROMPT_IDS.REQUIREMENTS_TO_OUTLINES, {
      ...baseVariables,
      experiencePresetContext: buildExperiencePresetPromptContext(HISTORICAL_VLOGGER_PRESET),
    });

    expect(regularPrompt?.user).not.toContain('Historical Vlogger Experience Preset');
    expect(presetPrompt?.user).toContain('Historical Vlogger Experience Preset');
    expect(presetPrompt?.user).toContain('Do not invent citations');
    expect(presetPrompt?.user).toContain('source-literacy question');
  });

  it('injects governed co-thinking context only when the preset is selected', () => {
    const baseVariables = {
      requirement: 'Teach students how to use AI while preserving agency',
      language: 'en-US',
      pdfContent: 'None',
      availableImages: 'No images available',
      userProfile: '',
      hasSourceImages: false,
      imageEnabled: false,
      videoEnabled: false,
      mediaEnabled: false,
      researchContext: 'None',
      teacherContext: '',
      adaptivePrompt: '',
    };
    const regularPrompt = buildPrompt(PROMPT_IDS.REQUIREMENTS_TO_OUTLINES, baseVariables);
    const presetPrompt = buildPrompt(PROMPT_IDS.REQUIREMENTS_TO_OUTLINES, {
      ...baseVariables,
      experiencePresetContext: buildExperiencePresetPromptContext(GOVERNED_CO_THINKING_PRESET),
    });

    expect(regularPrompt?.user).not.toContain('Governed Co-Thinking Practice Mode');
    expect(presetPrompt?.user).toContain('Governed Co-Thinking Practice Mode');
    expect(presetPrompt?.user).toContain('baseline intention');
    expect(presetPrompt?.user).toContain('no-AI transfer task');
    expect(presetPrompt?.user).toContain('Do not score students with AUI');
  });

  it('exposes reusable metadata for the historical-vlogger preset', () => {
    const definition = getExperiencePresetDefinition(HISTORICAL_VLOGGER_PRESET);
    const governedDefinition = getExperiencePresetDefinition(GOVERNED_CO_THINKING_PRESET);

    expect(definition).toMatchObject({
      id: HISTORICAL_VLOGGER_PRESET,
      labelKey: 'toolbar.historyVlogPreset',
      hintKey: 'toolbar.historyVlogPresetHint',
      sourceRequirement: 'source-context',
    });
    expect(getAvailableExperiencePresetDefinitions()).toContain(definition);
    expect(governedDefinition).toMatchObject({
      id: GOVERNED_CO_THINKING_PRESET,
      labelKey: 'toolbar.governedCoThinkingPreset',
      hintKey: 'toolbar.governedCoThinkingPresetHint',
      composerTitleKey: 'toolbar.governedCoThinkingActiveTitle',
      composerHintKey: 'toolbar.governedCoThinkingActiveHint',
      composerPlaceholderKey: 'toolbar.governedCoThinkingPlaceholder',
      sourceRequirement: 'none',
    });
    expect(governedDefinition?.checkpointKeys).toEqual([
      'toolbar.governedCoThinkingCheckpointIntention',
      'toolbar.governedCoThinkingCheckpointSteering',
      'toolbar.governedCoThinkingCheckpointVerification',
      'toolbar.governedCoThinkingCheckpointAuthorship',
      'toolbar.governedCoThinkingCheckpointTransfer',
    ]);
    expect(getAvailableExperiencePresetDefinitions()).toContain(governedDefinition);
  });

  it('processes simple conditional blocks before variable interpolation', () => {
    expect(
      processConditionalBlocks('A {{#if enabled}}B {{name}}{{/if}} C', {
        enabled: true,
      }),
    ).toBe('A B {{name}} C');
    expect(
      processConditionalBlocks('A {{#if enabled}}B{{/if}} C', {
        enabled: false,
      }),
    ).toBe('A  C');
  });
});
