consts: [[__AttributeMarker.Bindings__, "class"], [__AttributeMarker.Bindings__, "attr.class"]],
template: function MyComponent_Template(rf, ctx) {
  if (rf & 1) {
    $r3$.ɵɵdomTemplate(0, MyComponent_ng_template_0_Template, 0, 0, "ng-template", 0);
    $r3$.ɵɵclassResolver(function MyComponent_Template_ng_template_class_0_listener($event) {
      return $event.resolve(ctx.resolve($event.resolver));
    }, 3);
    $r3$.ɵɵdomTemplate(1, MyComponent_ng_template_1_Template, 0, 0, "ng-template", 1);
    $r3$.ɵɵclassResolver(function MyComponent_Template_ng_template_attr_class_1_listener($event) {
      return ctx.capture($event);
    }, 1);
  }
}
