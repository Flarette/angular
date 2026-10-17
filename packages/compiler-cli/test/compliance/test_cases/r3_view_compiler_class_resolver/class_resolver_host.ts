import {Component} from '@angular/core';

@Component({
  selector: 'my-component',
  template: '',
  host: {class: 'px-4', '(class)': 'resolve($event)'},
})
export class MyComponent {
  resolve(sources: unknown): string {
    return '';
  }
}
