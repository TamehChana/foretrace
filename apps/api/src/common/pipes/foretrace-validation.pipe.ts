import { Injectable, ValidationPipe, type ValidationPipeOptions } from '@nestjs/common';
import type { ArgumentMetadata, Type } from '@nestjs/common/interfaces';
import { getMetadataStorage } from 'class-validator';

function bodyDtoHasValidatorMetadata(metatype: Type<unknown>): boolean {
  if (!metatype || typeof metatype !== 'function') {
    return false;
  }
  try {
    const storage = getMetadataStorage();
    const metas = storage.getTargetValidationMetadatas(
      metatype,
      '',
      false,
      false,
    );
    return metas.length > 0;
  } catch {
    return false;
  }
}

/**
 * Like {@link ValidationPipe}, but if the body `metatype` has no
 * `class-validator` metadata (broken `emitDecoratorMetadata` / wrong class),
 * the raw body is passed through so a route-level {@link BodyDtoPipe} can
 * still validate.
 */
@Injectable()
export class ForetraceValidationPipe extends ValidationPipe {
  constructor(options?: ValidationPipeOptions) {
    super(options);
  }

  async transform(value: unknown, metadata: ArgumentMetadata): Promise<unknown> {
    if (metadata.type === 'body') {
      const mt = metadata.metatype;
      if (
        mt &&
        typeof mt === 'function' &&
        !bodyDtoHasValidatorMetadata(mt as Type<unknown>)
      ) {
        return value;
      }
    }
    return super.transform(value, metadata);
  }
}
