import {Directive, HostListener} from '@angular/core';

@Directive({
  selector: '[myDir]',
  host: {'(class)': 'fromHost($event)'},
})
export class MyDirective {
  fromHost(sources: unknown): string {
    return '';
  }

  @HostListener('class', ['$event'])
  fromDecorator(sources: unknown): string {
    return '';
  }
}
