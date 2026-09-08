# Classroom readability, completion and local demo

The default 1280 × 720 classroom reduced its slide to about 250 × 140 pixels because fixed header, guide and discussion allowances were subtracted from an already constrained flex layout. Completing the demo then showed a phantom extra scene, a loading title and a clipped summary. Findings R5, R6 and R8 are addressed together with the complete no-key demo.

## Resulting behavior

The slide uses the remaining classroom space, fitting both width and height at 16:9. Lesson guidance and notes open from a keyboard-operable disclosure; their full text wraps. Discussion starts folded, opens for active interaction unless the user has chosen otherwise, and keeps current speech visible when folded. Header text and controls wrap on narrow screens. Scene and chat panels open over the content on phones, and scene selection closes the phone sidebar. The local-storage notice and publishing action stay visible.

Phone panels start closed independently of the saved desktop layout, then follow the user's phone toggles. Playback is available for scenes with actions, including interactive widgets; it is not limited to slide scenes. The existing full browser suite caught both compatibility cases in the first candidate and verifies their repairs.

Reading view is available for slides and is the default below 768 CSS pixels. It reflows sanitized prose and shape text without imported font sizes, colors or positioning, presents formula source as its accessible name, exposes table and chart data, and displays existing media without scheduling generation. Text begins at 16 CSS pixels. Original slide view remains available for arrangements, paths and diagrams that cannot be represented faithfully by reading order. The reading order follows element position; an image without a stored description has an explicit generic label. This does not invent a diagram description or certify equivalent access to every imported slide.

Quiz activities and the completion summary use the full content area with scrolling. Completion has its own header, quiz score, actual scene counts and review actions. The completion navigation item is not another numbered scene. Reviewing the checkpoint or starting from the beginning retains the learner's saved answers. Reaching completion does not assert that every scene was visited.

The four-scene public demo now contains three readable slides and a two-question, locally graded checkpoint with explanations. Learner names, scores and grouping thresholds are synthetic examples. Seeding returns fresh copies. The explicit local launch marker remains valid for ordinary reloads in the same tab and is cleared when returning home; teacher classrooms still load through server authorization. Tests retain the control that a direct classroom URL without the local launch context cannot open demo data.

Toolbar, reading, completion and demo controls have English, Chinese, Japanese and Russian labels. Space activates focused buttons and the guide disclosure instead of being consumed by the global playback shortcut. The volume slider is labeled and reachable by keyboard. Dark and light label contrast and visible toolbar focus were corrected.

The focused rendering backport restores the whiteboard's height/width ratio to 9/16 and preserves line breaks in markup-free text and shape text. HTML source formatting does not become extra visible line breaks.

## Evidence and limits

The browser journeys cover the home demo CTA, checkpoint answers and explanations, ordinary IndexedDB-backed reloads at the quiz report and completion, exact four-scene counts, review navigation, phone sidebar selection, keyboard disclosure/reading/volume controls and absence of page errors. Provider-generation, grading and chat requests are intercepted and asserted absent. The demo requires no API key and the checks used no paid providers.

System Chrome screenshots were inspected at 1280 × 720 and 390 × 844, in light and dark themes. The revised laptop slide measured approximately 745 × 419 pixels. A separate 640 × 360 CSS viewport verifies the layout equivalent of a 1280 × 720 window at 200% zoom: reading, navigation and home controls remain reachable. This is reflow evidence; the browser chrome's zoom control was not operated. Small-height layouts allow vertical scrolling rather than clipping controls.

Eight axe-core 4.11.1 sweeps cover laptop slides, laptop reading, phone reading and completion in both themes. Each reports zero violations, while retaining 8–20 nodes per sweep for incomplete color-contrast assessment. Those incomplete results are not passes. A separate calculation from computed browser styles gives reading-text contrast of 17.83:1 in light mode and 16.28:1 in dark mode; the reading note is 4.76:1 and 6.78:1 respectively. These measured pairs exceed the [WCAG normal-text threshold](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). Other incomplete pairs remain recorded for manual review.

Native agent-browser DOM, interaction and error checks were also used. Its later screenshot calls stalled in this environment, so the final visual artifacts come from successful Playwright captures in system Chrome. Failed tool attempts remain in the evidence rather than being reported as successful screenshots. No screen-reader, real mobile-device, paid narration or authenticated production journey is claimed.

Focused unit tests cover the demo answer keys and isolated seeds, safe reading prose/formula/table/media rendering, the actual whiteboard API, and plain-text rendering. The repository-required type, unit, localization, lint, format, dependency, production-build, benchmark and operations/browser results are recorded with the exact integrated commit in the implementation evidence. Package version remains 0.9.2; this change does not publish a release or enable hosted providers.

Rollback if lesson controls, scene navigation or saved progress regress: revert this usability slice to its recorded parent commit. No server schema or teacher-data migration is required. Re-entering the public demo after a code rollback may reseed that synthetic example to the older seed version; it is not a teacher classroom backup mechanism.
