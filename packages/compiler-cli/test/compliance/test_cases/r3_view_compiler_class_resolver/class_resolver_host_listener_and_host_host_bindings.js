…
hostBindings: function MyDirective_HostBindings(rf, ctx) {
  if (rf & 1) {
    i0.ɵɵclassResolver(function MyDirective_class_HostBindingHandler($event) {
      return ctx.fromDecorator($event);
    });
  }
}
