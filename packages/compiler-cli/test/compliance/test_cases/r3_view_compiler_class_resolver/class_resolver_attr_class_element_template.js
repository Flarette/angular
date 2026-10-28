template: function MyComponent_Template(rf, ctx) {
  if (rf & 1) {
    $r3$.ɵɵdomElementStart(0, "div", 0);
    $r3$.ɵɵdomListener("attr.class", function MyComponent_Template_div_attr_class_0_listener($event) {
      return ctx.resolve($event);
    });
    $r3$.ɵɵdomElementEnd();
  }
}
