import {Component} from '@angular/core';

@Component({
  selector: 'my-component',
  template: `<div class="p-2" [class.px-4]="wide" (class)="cn($event, extra)"></div>`,
})
export class MyComponent {
  wide = true;
  extra = 'py-1';

  cn(...inputs: unknown[]): string {
    return '';
  }
}
