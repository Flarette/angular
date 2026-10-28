hostBindings: function MyDirective_HostBindings(rf, ctx) {
  if (rf & 1) {
    i0.ɵɵclassResolver(function MyDirective_attr_class_HostBindingHandler($event) {
      return ctx.resolve($event);
    }, 1);
  }
}
