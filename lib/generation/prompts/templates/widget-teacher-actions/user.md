Generate teacher actions for this widget.

## Widget Type

{{widgetType}}

## Widget Description

{{description}}

## Key Points

{{keyPoints}}

## Widget Config

{{widgetConfig}}

{{#if hasElementInventory}}
## Element Inventory

{{elementInventory}}

Use only the exact selectors above for highlight, annotation, and reveal targets. Do not infer selectors from labels, text, URLs, or class names.
{{/if}}

## Course Language

{{languageDirective}}

All teacher action labels, speech text, annotations, reveal text, and state explanation content must follow the Course Language directive above.

---

Generate 3-7 teacher actions that guide the student through this widget.

**IMPORTANT**:
- For `setState` actions, use the EXACT variable names from the widget config above
- For `highlight`/`annotation` targets, use selectors matching the element ID convention:
  - Sliders: `#{variable_name}-slider`
  - Displays: `#{variable_name}-display`
  - Nodes (diagrams): `#n1`, `#n2`, etc.
