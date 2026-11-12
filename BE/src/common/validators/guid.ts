import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { Matches, ValidationOptions } from 'class-validator';

/**
 * Any SQL Server uniqueidentifier (8-4-4-4-12 hex). Not @IsUUID / ParseUUIDPipe: those require an RFC 4122 version
 * digit (1-8), and the ids NEWSEQUENTIALID() generates often carry another one (e.g. C8737FC5-7DD4-F111-…).
 */
export const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const IsGuid = (options?: ValidationOptions) =>
  Matches(GUID_PATTERN, { message: ({ property }) => `${property} must be a UUID`, ...options });

/** Route-param counterpart of IsGuid. */
@Injectable()
export class ParseGuidPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!GUID_PATTERN.test(value)) throw new BadRequestException('Validation failed (uuid is expected)');
    return value;
  }
}
