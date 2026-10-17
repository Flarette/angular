# Deferred findings

- An output named `class` sets `TNodeFlags.hasClassInput` in `setShadowStylingInputFlags`
  (`packages/core/src/render3/view/directives.ts`), so a template `[class]` binding on that
  element is routed to directive inputs and dropped. Found in the WP1 review; upstream behavior.
  Owner, 2026-10-17: document it in the proposal and fix it later in a separate upstream PR.
- WP4: the blocks rule in `packages/compiler/src/render3/partial/component.ts` sets `minVersion` to `17.0.0` unconditionally, so a component with blocks and signal inputs (`17.1.0`) or signal queries (`17.2.0`) declares `17.0.0` (upstream behavior; WP4 only guards `22.3.0`).
