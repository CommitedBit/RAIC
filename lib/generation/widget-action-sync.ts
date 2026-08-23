import sanitizeHtml from 'sanitize-html';

import type { TeacherAction, WidgetType } from '@/lib/types/widgets';

export const WIDGET_ACTION_SYNC_ENV = 'RAIC_WIDGET_ACTION_SYNC';
export const MAX_WIDGET_INVENTORY_ENTRIES = 30;
export const MAX_WIDGET_INVENTORY_CHARS = 4096;

const MAX_HTML_CHARS = 200_000;
const MAX_VALUE_CHARS = 64;
const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const NON_TARGET_TAGS = new Set(['html', 'head', 'title', 'meta', 'link', 'style', 'script']);
const SEMANTIC_ATTRIBUTES = [
  'role',
  'type',
  'name',
  'data-step-id',
  'data-action',
  'data-node',
  'data-var',
] as const;
const SELECTOR_ATTRIBUTES = [
  'data-step-id',
  'data-action',
  'data-node',
  'data-var',
  'name',
] as const;

type FlagEnvironment = Record<string, string | undefined>;

export interface WidgetInventoryEntry {
  selector: string;
  tagName: string;
  attributes: Partial<Record<(typeof SEMANTIC_ATTRIBUTES)[number], string>>;
}

export function isWidgetActionSyncEnabled(env: FlagEnvironment = process.env): boolean {
  const value = env[WIDGET_ACTION_SYNC_ENV]?.trim().toLowerCase();
  return value ? TRUE_VALUES.has(value) : false;
}

export function supportsDomWidgetActionSync(widgetType: WidgetType): boolean {
  return widgetType !== 'visualization3d';
}

function isStableValue(value: string | undefined, allowNumericStart = true): value is string {
  if (!value || value.length > MAX_VALUE_CHARS) return false;
  const pattern = allowNumericStart
    ? /^[A-Za-z0-9_][A-Za-z0-9_.:-]*$/
    : /^[A-Za-z_][A-Za-z0-9_.:-]*$/;
  return pattern.test(value);
}

function escapeCssIdentifier(value: string): string {
  return value.replace(/[.:]/g, (character) => `\\${character}`);
}

function buildSelector(attributes: Record<string, string>): string | null {
  if (isStableValue(attributes.id, false)) return `#${escapeCssIdentifier(attributes.id)}`;

  for (const attribute of SELECTOR_ATTRIBUTES) {
    const value = attributes[attribute];
    if (isStableValue(value)) return `[${attribute}="${value}"]`;
  }

  return null;
}

/**
 * Parse generated HTML into a bounded selector inventory. Only stable IDs and
 * semantic attributes are retained; text, classes, styles, and URL attributes
 * never enter the result.
 */
export function extractWidgetElementInventory(html: string): WidgetInventoryEntry[] {
  const entriesBySelector = new Map<string, WidgetInventoryEntry>();
  const duplicateSelectors = new Set<string>();

  try {
    sanitizeHtml(html.slice(0, MAX_HTML_CHARS), {
      allowedTags: false,
      allowedAttributes: false,
      allowVulnerableTags: true,
      transformTags: {
        '*': (tagName, attributes) => {
          if (!NON_TARGET_TAGS.has(tagName.toLowerCase())) {
            const selector = buildSelector(attributes);
            if (selector && !duplicateSelectors.has(selector)) {
              if (entriesBySelector.has(selector)) {
                entriesBySelector.delete(selector);
                duplicateSelectors.add(selector);
                return { tagName, attribs: attributes };
              }

              if (entriesBySelector.size >= MAX_WIDGET_INVENTORY_ENTRIES) {
                return { tagName, attribs: attributes };
              }

              const semanticAttributes: WidgetInventoryEntry['attributes'] = {};
              for (const attribute of SEMANTIC_ATTRIBUTES) {
                const value = attributes[attribute];
                if (isStableValue(value)) semanticAttributes[attribute] = value;
              }
              entriesBySelector.set(selector, {
                selector,
                tagName: tagName.toLowerCase(),
                attributes: semanticAttributes,
              });
            }
          }

          return { tagName, attribs: attributes };
        },
      },
    });
  } catch {
    return [];
  }

  return Array.from(entriesBySelector.values());
}

export function formatWidgetElementInventory(entries: WidgetInventoryEntry[]): string {
  if (entries.length === 0) {
    return '(no stable DOM targets detected; generate speech and setState actions only)';
  }

  const lines: string[] = [];
  let totalLength = 0;
  for (const entry of entries.slice(0, MAX_WIDGET_INVENTORY_ENTRIES)) {
    const metadata = Object.entries(entry.attributes)
      .map(([key, value]) => `${key}=${value}`)
      .join(' ');
    const line = `- ${entry.selector} <${entry.tagName}>${metadata ? ` ${metadata}` : ''}`;
    if (totalLength + line.length + 1 > MAX_WIDGET_INVENTORY_CHARS) break;
    lines.push(line);
    totalLength += line.length + 1;
  }

  return lines.join('\n');
}

export function filterWidgetTeacherActions(
  actions: TeacherAction[],
  inventory: WidgetInventoryEntry[],
): TeacherAction[] {
  const validTargets = new Set(inventory.map((entry) => entry.selector));

  return actions.slice(0, 10).filter((action) => {
    if (action.type === 'speech' || action.type === 'setState') return true;
    return typeof action.target === 'string' && validTargets.has(action.target);
  });
}
