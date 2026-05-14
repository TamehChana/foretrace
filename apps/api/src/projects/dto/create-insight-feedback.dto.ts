import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { InsightFeedbackKind } from '@prisma/client';

export class CreateInsightFeedbackDto {
  @IsEnum(InsightFeedbackKind)
  kind!: InsightFeedbackKind;

  @IsBoolean()
  helpful!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value === null ? null : undefined,
  )
  comment?: string | null;
}
