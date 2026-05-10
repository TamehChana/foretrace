import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Optional URL-ish slug (`acme`, `acme-team`, …). Omit or blank for no slug (multiple orgs allowed). */
export class CreateOrganizationDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(160)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : String(value ?? '').trim(),
  )
  name!: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null) {
      return undefined;
    }
    const s = String(value).trim().toLowerCase();
    return s.length === 0 ? undefined : s;
  })
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message:
      'slug must use lowercase letters, digits, or single hyphens between segments',
  })
  slug?: string;
}
