hostBindings: function ShorthandDirective_HostBindings(rf, ctx) {
  if (rf & 1) {
    i0.ɵɵclassResolver(function ShorthandDirective_class_HostBindingHandler($event) {
      return $event.resolve((ctx.choice == null ? null : ctx.choice.classes)($event.resolver));
    }, 3);
  }
}
…
hostBindings: function ExpansionDirective_HostBindings(rf, ctx) {
  if (rf & 1) {
    i0.ɵɵclassResolver(function ExpansionDirective_attr_class_HostBindingHandler($event) {
      return $event.resolve((ctx.choice == null ? null : ctx.choice.classes)($event.resolver));
    }, 1);
  }
}
