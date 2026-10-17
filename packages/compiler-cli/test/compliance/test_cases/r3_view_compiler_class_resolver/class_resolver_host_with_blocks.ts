import {Component} from '@angular/core';

@Component({
  selector: 'my-component',
  template: `@if (show) { <span></span> }`,
  host: {'(class)': 'resolve($event)'},
})
export class MyComponent {
  show = true;

  resolve(sources: unknown): string {
    return '';
  }
}
