function MyComponent_Conditional_0_Template(rf, ctx) {
  if (rf & 1) {
    const $_r1$ = $r3$.ɵɵgetCurrentView();
    $r3$.ɵɵdomElementStart(0, "div", 0);
    $r3$.ɵɵclassResolver(function MyComponent_Conditional_0_Template_div_class_0_listener($event) {
      $r3$.ɵɵrestoreView($_r1$);
      const $ctx_r1$ = $r3$.ɵɵnextContext();
      return $r3$.ɵɵresetView($event.resolve($ctx_r1$.classes($event.resolver)));
    }, 3);
    $r3$.ɵɵdomElementEnd();
  }
}
…
consts: [[__AttributeMarker.Bindings__, "class"]],
template: function MyComponent_Template(rf, ctx) {
  if (rf & 1) {
    $r3$.ɵɵconditionalCreate(0, MyComponent_Conditional_0_Template, 1, 0, "div");
  }
  if (rf & 2) {
    $r3$.ɵɵconditional(ctx.show ? 0 : -1);
  }
}
