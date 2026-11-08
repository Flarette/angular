import {BoundClassResolver, Component, ResolvedClasses} from '@angular/core';

@Component({
  selector: 'my-component',
  template: '',
  host: {class: 'px-4', '(class)': 'classes'},
})
export class MyComponent {
  classes(cn: BoundClassResolver): ResolvedClasses {
    return cn();
  }
}
