…
hostBindings: function MyDirective_HostBindings(rf, ctx) {
  if (rf & 1) {
    i0.ɵɵclassResolver(function MyDirective_class_HostBindingHandler($event) {
      return $event.resolve(ctx.fromDecorator()($event.resolver));
    }, 3);
  }
}
