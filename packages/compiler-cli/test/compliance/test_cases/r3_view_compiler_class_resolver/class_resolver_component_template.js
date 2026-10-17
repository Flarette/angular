…
consts: [[__AttributeMarker.Classes__, "px-2", __AttributeMarker.Bindings__, "class"]],
template: function MyComponent_Template(rf, ctx) {
  if (rf & 1) {
    $r3$.ɵɵelementStart(0, "ui-button", 0);
    $r3$.ɵɵclassResolver(function MyComponent_Template_ui_button_class_0_listener($event) {
      return ctx.cn($event);
    });
    $r3$.ɵɵtext(1, "Save");
    $r3$.ɵɵelementEnd();
  }
},
dependencies: [UiButton]
