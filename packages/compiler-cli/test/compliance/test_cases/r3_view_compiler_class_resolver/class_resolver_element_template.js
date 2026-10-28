…
consts: [[__AttributeMarker.Classes__, "p-2", __AttributeMarker.Bindings__, "class"]],
template: function MyComponent_Template(rf, ctx) {
  if (rf & 1) {
    $r3$.ɵɵdomElementStart(0, "div", 0);
    $r3$.ɵɵclassResolver(function MyComponent_Template_div_class_0_listener($event) {
      return $event.resolve(ctx.classes($event.resolver));
    }, 3);
    $r3$.ɵɵdomElementEnd();
  }
  if (rf & 2) {
    $r3$.ɵɵclassProp("px-4", ctx.wide);
  }
}
