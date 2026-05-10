import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(180)
  @Transform(({ value }) =>
    value === undefined
      ? undefined
      : typeof value === 'string'
        ? value.trim()
        : String(value ?? '').trim(),
  )
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  @Transform(({ value }) =>
    value === undefined
      ? undefined
      : typeof value === 'string'
        ? value.trim()
        : String(value),
  )
  description?: string | null;

  @IsOptional()
  @IsBoolean()
  /** When **`true`**, sets **`archivedAt`** (soft archive); **`false`** clears archive. */
  archived?: boolean;
}
