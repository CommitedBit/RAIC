// @vitest-environment jsdom
import katex from 'katex';
import { describe, expect, it } from 'vitest';
import { sanitizeFormulaContent, sanitizeLatexHtml } from '@/lib/utils/sanitize-latex-html';

function parsedFormula(html: string) {
  const root = document.createElement('div');
  root.innerHTML = html;
  // Compare parsed DOM rather than irrelevant serializer whitespace/void syntax.
  for (const element of root.querySelectorAll<HTMLElement>('[style]')) {
    const style = document.createElement('span').style;
    style.cssText = element.getAttribute('style') ?? '';
    const declarations = Array.from(style)
      .sort()
      .map((property) => `${property}:${style.getPropertyValue(property)}`);
    element.setAttribute('style', declarations.join(';'));
  }
  return root.innerHTML;
}

const FORMULAS = [
  String.raw`\frac{1}{\sqrt{x^2+1}}`,
  String.raw`\sum_{n=1}^{\infty}\frac{1}{n^2}=\frac{\pi^2}{6}`,
  String.raw`\int_0^1 x\,dx=\frac12`,
  String.raw`\begin{pmatrix}a&b\\c&d\end{pmatrix}`,
  String.raw`\left\{\begin{array}{ll}x^2&x>0\\0&x\le0\end{array}\right.`,
  String.raw`\overbrace{a+b}^{n}\xrightarrow{f}\underbrace{c+d}_{m}`,
  String.raw`\widehat{ABC}+\overline{x}+\cancel{y}`,
  String.raw`\color{red}{\mathbf{x}}+\mathbb{R}+\text{area in cm}^2`,
  String.raw`\phantom{x}\raisebox{.5em}{y}\rule{1em}{.1em}`,
  String.raw`\boxed{\binom{n}{k}}\quad\sqrt[3]{x}`,
  String.raw`\overset{!}{=}\underset{x\to0}{\lim}f(x)`,
  String.raw`\begin{array}{c:c}a&b\\c&d\end{array}`,
  String.raw`\pmb{x}`,
  String.raw`\colorbox{yellow}{$x$}`,
  String.raw`\fcolorbox{red}{yellow}{$x$}`,
  String.raw`x\tag{1}`,
  String.raw`x\\y`,
];

describe.each(['html', 'htmlAndMathml'] as const)('formula compatibility: %s', (output) => {
  it.each(FORMULAS)('preserves the parsed KaTeX layout for %s', (latex) => {
    const original = katex.renderToString(latex, {
      output,
      displayMode: true,
      trust: false,
      strict: false,
    });
    const sanitized = sanitizeLatexHtml(original);

    expect(parsedFormula(sanitized)).toBe(parsedFormula(original));
    expect(sanitizeLatexHtml(sanitized)).toBe(sanitized);
  });
});

describe('formula security boundary', () => {
  it.each([
    '<img src=x onerror="void 0"><script>void 0</script>',
    '<svg ONLOAD="void 0"><path d="M0 0L1 1" onClick="void 0"/></svg>',
    '<svg><animate attributeName="href" values="javascript:void(0)"/><use href="//invalid.example/x"/></svg>',
    '<svg><foreignObject><img src=x onerror="void 0"></foreignObject></svg>',
    '<math><annotation-xml encoding="text/html"><img src=x onerror="void 0"></annotation-xml></math>',
    '<math><mtext href="jav&#x61;script:void(0)" xlink:href="//invalid.example/x">x</mtext></math>',
    '<xmp><img src=x onerror="void 0"></xmp><noscript><img src=x onerror="void 0"></noscript>',
    '<iframe srcdoc="<script>void 0</script>"></iframe><object data="//invalid.example/x"></object>',
    '<span style="width:expression(void 0);color:red;background-image:url(//invalid.example/x)">x</span>',
    String.raw`<span style="width:u\72l(//invalid.example/x);position:fixed;behavior:url(x)">x</span>`,
    '<math><mtext><table><mglyph><style><!--</style><img title="--><img src=x onerror=void(0)>">',
  ])('removes executable markup and resource URLs: %s', (attack) => {
    const root = document.createElement('div');
    root.innerHTML = sanitizeLatexHtml(attack);

    expect(
      root.querySelector(
        'script,style,img,iframe,object,embed,animate,set,use,foreignObject,annotation-xml',
      ),
    ).toBeNull();
    for (const element of root.querySelectorAll('*')) {
      for (const attribute of element.attributes) {
        expect(attribute.name).not.toMatch(/^(?:on|src|href|xlink:|data$|formaction$)/i);
      }
      expect(element.getAttribute('style') ?? '').not.toMatch(
        /url\s*\(|expression|fixed|behavior/i,
      );
    }
  });

  it('preserves ordinary formula styles while excluding escaped or external CSS', () => {
    const safe = sanitizeLatexHtml(
      '<span class="katex" style="color:#123456;top:-.3em;margin-right:.1em;position:relative;filter:url(x)">x</span>',
    );
    expect(safe).toContain('color:#123456');
    expect(safe).toContain('top:-.3em');
    expect(safe).toContain('position:relative');
    expect(safe).not.toContain('filter');
  });
});

describe('formula-only data normalization', () => {
  it('copies nested formulas while preserving other content and non-JSON objects', () => {
    const literal = '<img src=x onerror="void 0">';
    const date = new Date(1);
    const input = {
      whiteboards: [{ elements: [{ type: 'latex', html: literal, latex: literal, path: 'M0 0' }] }],
      code: { type: 'code', html: literal, code: literal },
      table: { type: 'table', data: [[{ text: literal }]] },
      interactive: { type: 'interactive', html: literal },
      date,
    };
    const result = sanitizeFormulaContent(input);

    expect(result.whiteboards[0].elements[0]).toEqual({
      type: 'latex',
      html: '',
      latex: literal,
      path: 'M0 0',
    });
    expect(result.code).toEqual(input.code);
    expect(result.table).toEqual(input.table);
    expect(result.interactive).toEqual(input.interactive);
    expect(result.date).toBe(date);
    expect(input.whiteboards[0].elements[0].html).toBe(literal);
  });

  it('handles deep, shared and cyclic containers without changing their identity relationships', () => {
    const formula = { type: 'latex', html: '<script>void 0</script><span>x</span>' };
    const root: Record<string, unknown> = { formula, second: formula };
    root.self = root;
    let leaf = root;
    for (let index = 0; index < 12_000; index++) {
      const next: Record<string, unknown> = {};
      leaf.child = next;
      leaf = next;
    }
    leaf.formula = formula;

    const result = sanitizeFormulaContent(root);
    expect(result === root).toBe(false);
    expect(result.self === result).toBe(true);
    expect(result.formula === result.second).toBe(true);
    expect(result.formula).toEqual({ type: 'latex', html: '<span>x</span>' });
    expect(formula.html).toContain('<script>');
  });

  it('treats a JSON __proto__ property as data without modifying object prototypes', () => {
    const input = JSON.parse('{"__proto__":{"type":"latex","html":"<script>void 0</script>"}}');
    const result = sanitizeFormulaContent(input);
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(Object.hasOwn(result, '__proto__')).toBe(true);
    expect(result.__proto__.html).toBe('');
    expect(Object.hasOwn(Object.prototype, 'html')).toBe(false);
  });
});
