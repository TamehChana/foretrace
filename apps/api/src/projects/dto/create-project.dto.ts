import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(180)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : String(value ?? '').trim(),
  )
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  @Transform(({ value }) =>
    value === undefined || value === null
      ? undefined
      : typeof value === 'string'
        ? value.trim()
        : String(value),
  )
  description?: string;
}
