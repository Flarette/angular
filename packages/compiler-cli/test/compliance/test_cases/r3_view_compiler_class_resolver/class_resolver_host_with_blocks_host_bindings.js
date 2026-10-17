hostBindings: function MyComponent_HostBindings(rf, ctx) {
  if (rf & 1) {
    i0.ɵɵclassResolver(function MyComponent_class_HostBindingHandler($event) {
      return ctx.resolve($event);
    });
  }
}
