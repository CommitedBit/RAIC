## Widget Action Bridge (Required When Enabled)

The host drives this sandboxed iframe with four `postMessage` types:
`SET_WIDGET_STATE`, `HIGHLIGHT_ELEMENT`, `ANNOTATE_ELEMENT`, and `REVEAL_ELEMENT`.
Register a listener and accept messages only from `window.parent`.

```javascript
function findWidgetTarget(selector) {
  if (typeof selector !== 'string') return null;
  try { return document.querySelector(selector); } catch { return null; }
}

window.addEventListener('message', function (event) {
  if (event.source !== window.parent || !event.data || typeof event.data.type !== 'string') return;
  const { type, target, state, content } = event.data;

  switch (type) {
    case 'SET_WIDGET_STATE': {
      if (!state || typeof state !== 'object') break;
      Object.entries(state).forEach(function ([key, value]) {
        let control = document.getElementById(key) || document.getElementById(key + '-slider');
        if (!control) {
          document.querySelectorAll('[data-var]').forEach(function (candidate) {
            if (!control && candidate.getAttribute('data-var') === key) control = candidate;
          });
        }
        if (control && 'value' in control) {
          control.value = String(value);
          control.dispatchEvent(new Event('input', { bubbles: true }));
          control.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      window.dispatchEvent(new CustomEvent('openraic:widget-state', { detail: state }));
      break;
    }
    case 'HIGHLIGHT_ELEMENT': {
      const element = findWidgetTarget(target);
      if (!element) break;
      element.classList.add('openraic-widget-highlight');
      window.setTimeout(function () { element.classList.remove('openraic-widget-highlight'); }, 3000);
      break;
    }
    case 'ANNOTATE_ELEMENT': {
      const element = findWidgetTarget(target);
      if (!element || typeof content !== 'string') break;
      const note = document.createElement('div');
      note.className = 'openraic-widget-annotation';
      note.textContent = content;
      element.insertAdjacentElement('afterend', note);
      window.setTimeout(function () { note.remove(); }, 4000);
      break;
    }
    case 'REVEAL_ELEMENT': {
      const element = findWidgetTarget(target);
      if (!element) break;
      element.hidden = false;
      element.style.display = '';
      element.style.opacity = '1';
      break;
    }
  }
});
```

Add styles for `.openraic-widget-highlight` and `.openraic-widget-annotation` that remain visible in light and dark widget themes. Use stable IDs or semantic `data-*` attributes on controls, nodes, panels, hints, and results. Do not rely on visible text or generated utility classes as selectors.
