import {ClassCallback, Directive, HostListener} from '@angular/core';

@Directive({
  selector: '[myDir]',
  host: {'(class)': 'fromHost'},
})
export class MyDirective {
  fromHost: ClassCallback = (cn) => cn();

  @HostListener('class')
  fromDecorator(): ClassCallback {
    return (cn) => cn();
  }
}
