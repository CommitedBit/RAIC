import sanitizeHtml from 'sanitize-html';

// KaTeX snapshots contain layout spans/SVG and may include presentation MathML
// in imported lessons. None of these elements needs a URL, event or embed.
const MATH_TAGS = [
  'math',
  'semantics',
  'annotation',
  'mrow',
  'mi',
  'mn',
  'mo',
  'mtext',
  'mspace',
  'ms',
  'mfrac',
  'msqrt',
  'mroot',
  'msub',
  'msup',
  'msubsup',
  'munder',
  'mover',
  'munderover',
  'mtable',
  'mtr',
  'mtd',
  'mstyle',
  'menclose',
  'mpadded',
  'mphantom',
  'mmultiscripts',
  'mprescripts',
  'none',
];

const SAFE_CSS_VALUE =
  /^(?!.*(?:url\s*\(|expression\s*\(|@|vbscript:|javascript:))[^\\<>{};\u0000-\u001f]{1,240}$/i;

const LAYOUT_STYLES = [
  'color',
  'background-color',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'line-height',
  'text-align',
  'text-shadow',
  'vertical-align',
  'white-space',
  'letter-spacing',
  'width',
  'height',
  'min-width',
  'max-width',
  'min-height',
  'max-height',
  'top',
  'bottom',
  'left',
  'right',
  'margin',
  'margin-left',
  'margin-right',
  'margin-top',
  'margin-bottom',
  'padding',
  'padding-left',
  'padding-right',
  'padding-top',
  'padding-bottom',
  'border',
  'border-width',
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
  'border-color',
  'border-style',
  'border-right-style',
];

/** Keep inert formula layout; discard executable markup and external resources. */
export function sanitizeLatexHtml(html: string): string {
  if (!html) return '';

  return sanitizeHtml(html, {
    allowedTags: ['span', 'svg', 'path', 'line', ...MATH_TAGS],
    allowedAttributes: {
      '*': ['class', 'style'],
      span: ['aria-hidden'],
      svg: ['xmlns', 'width', 'height', 'viewBox', 'preserveAspectRatio', 'aria-hidden'],
      path: ['d'],
      line: ['x1', 'y1', 'x2', 'y2', 'stroke-width'],
      math: ['xmlns', 'display'],
      annotation: ['encoding'],
      mo: [
        'fence',
        'stretchy',
        'symmetric',
        'largeop',
        'movablelimits',
        'lspace',
        'rspace',
        'minsize',
        'maxsize',
      ],
      mspace: ['width', 'height', 'depth', 'mathbackground', 'linebreak'],
      mfrac: ['linethickness', 'numalign', 'denomalign'],
      mstyle: ['displaystyle', 'scriptlevel', 'mathvariant', 'mathcolor', 'mathsize'],
      mi: ['mathvariant'],
      mn: ['mathvariant'],
      mtext: ['mathvariant'],
      mtable: ['columnalign', 'columnspacing', 'rowspacing', 'rowlines', 'columnlines', 'width'],
      mtd: ['columnalign', 'rowalign', 'columnspan', 'rowspan', 'width'],
      menclose: ['notation'],
      mpadded: ['width', 'height', 'depth', 'lspace', 'voffset', 'mathbackground'],
      mover: ['accent'],
      munder: ['accentunder'],
    },
    allowedStyles: {
      '*': {
        ...Object.fromEntries(LAYOUT_STYLES.map((property) => [property, [SAFE_CSS_VALUE]])),
        position: [/^(relative|absolute)$/],
        display: [/^(block|inline|inline-block|none)$/],
      },
    },
    // Preserve the case-sensitive geometry attributes emitted by KaTeX SVGs.
    parser: { lowerCaseAttributeNames: false },
    disallowedTagsMode: 'discard',
    nonTextTags: [
      'script',
      'style',
      'textarea',
      'option',
      'noscript',
      'xmp',
      'iframe',
      'object',
      'embed',
      'annotation-xml',
      'foreignobject',
    ],
  });
}

type Container = Record<string, unknown> | unknown[];

function isContainer(value: unknown): value is Container {
  if (!value || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return Array.isArray(value) || prototype === Object.prototype || prototype === null;
}

function copyContainer(value: Container): Container {
  return Array.isArray(value) ? value.slice() : { ...value };
}

/**
 * Copy JSON-like stage/scene data and sanitize only formula HTML. The iterative
 * traversal covers nested canvases/whiteboards without a recursion-depth limit.
 * Code, table text, interactive HTML, LaTeX source and non-JSON objects survive.
 */
export function sanitizeFormulaContent<T>(payload: T): T {
  if (!isContainer(payload)) return payload;
  const result = copyContainer(payload);
  const copies = new WeakMap<object, Container>([[payload, result]]);
  const pending: Array<[Container, Container]> = [[payload, result]];

  while (pending.length > 0) {
    const [source, target] = pending.pop()!;
    const isFormula = !Array.isArray(source) && source.type === 'latex';

    for (const [key, value] of Object.entries(source)) {
      let replacement: unknown;
      if (isFormula && key === 'html' && typeof value === 'string') {
        replacement = sanitizeLatexHtml(value);
      } else if (isContainer(value)) {
        let copy = copies.get(value);
        if (!copy) {
          copy = copyContainer(value);
          copies.set(value, copy);
          pending.push([value, copy]);
        }
        replacement = copy;
      } else {
        continue;
      }

      // JSON may contain a literal __proto__ key; never invoke its setter.
      Object.defineProperty(target, key, {
        value: replacement,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }
  }

  return result as T;
}
