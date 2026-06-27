import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'
import { MONTH_KEY_RE } from './fy-elapsed.js'

/**
 * Validates a :monthKey route param against 'YYYY-MM' (month 01–12). 400 on a
 * bad shape. Used by DELETE .../monthly-snapshots/:monthKey (where the value is
 * a path param, not a DTO field, so the global ValidationPipe doesn't cover it).
 */
@Injectable()
export class ParseMonthKeyPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (typeof value !== 'string' || !MONTH_KEY_RE.test(value)) {
      throw new BadRequestException('monthKey must be YYYY-MM (month 01–12).')
    }
    return value
  }
}
