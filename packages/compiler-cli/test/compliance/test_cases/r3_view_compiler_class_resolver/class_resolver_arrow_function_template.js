…
template: function MyComponent_Template(rf, ctx) {
  if (rf & 1) {
    $r3$.ɵɵdomElementStart(0, "div", 0);
    $r3$.ɵɵclassResolver(function MyComponent_Template_div_class_0_listener($event) {
      return $event.resolve((cn => cn(ctx.size))($event.resolver));
    }, 3);
    $r3$.ɵɵdomElementEnd();
  }
}
