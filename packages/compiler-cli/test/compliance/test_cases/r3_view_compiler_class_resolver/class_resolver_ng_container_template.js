…
template: function MyComponent_Template(rf, ctx) {
  if (rf & 1) {
    $r3$.ɵɵdomElementContainerStart(0, 0);
    $r3$.ɵɵdomListener("class", function MyComponent_Template_ng_container_class_0_listener($event) {
      return ctx.onClass($event);
    });
    $r3$.ɵɵdomElementContainerEnd();
  }
}
