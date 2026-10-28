import {BoundClassResolver, Component, ResolvedClasses} from '@angular/core';

@Component({
  selector: 'my-component',
  template: `<ng-container (class)="classes"></ng-container>`,
})
export class MyComponent {
  classes(cn: BoundClassResolver): ResolvedClasses {
    return cn();
  }
}
