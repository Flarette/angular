# Deferred findings

- An output named `class` sets `TNodeFlags.hasClassInput` in `setShadowStylingInputFlags`
  (`packages/core/src/render3/view/directives.ts`), so a template `[class]` binding on that
  element is routed to directive inputs and dropped. Found in the WP1 review; upstream behavior.
