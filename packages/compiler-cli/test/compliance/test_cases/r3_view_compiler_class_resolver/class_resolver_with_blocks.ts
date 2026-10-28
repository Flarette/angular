import {BoundClassResolver, Component, ResolvedClasses} from '@angular/core';

@Component({
  selector: 'my-component',
  template: `@if (show) { <div (class)="classes"></div> }`,
})
export class MyComponent {
  show = true;

  classes(cn: BoundClassResolver): ResolvedClasses {
    return cn();
  }
}
