import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'removeExtension',
  standalone: true
})
export class RemoveExtensionPipe implements PipeTransform {
  transform(filename: string): string {
    if (!filename) return '';
    const lastDotIndex = filename.lastIndexOf('.');
    return lastDotIndex === -1 ? filename : filename.substring(0, lastDotIndex);
  }
} 