import {Component} from '@angular/core';

@Component({
  selector: 'my-component',
  template: `<ng-container (class)="onClass($event)"></ng-container>`,
})
export class MyComponent {
  onClass(value: unknown): void {}
}
