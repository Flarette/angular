import {Component} from '@angular/core';

@Component({
  selector: 'my-component',
  template: `<div (class)="(sources) => cn(sources, size)"></div>`,
})
export class MyComponent {
  size = 'px-2';

  cn(...inputs: unknown[]): string {
    return '';
  }
}
