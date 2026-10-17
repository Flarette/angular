import {Component} from '@angular/core';

@Component({
  selector: 'my-component',
  template: `@if (show) { <div (class)="cn($event)"></div> }`,
})
export class MyComponent {
  show = true;

  cn(...inputs: unknown[]): string {
    return '';
  }
}
