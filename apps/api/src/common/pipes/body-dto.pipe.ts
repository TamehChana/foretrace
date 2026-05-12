import { BadRequestException, PipeTransform, Type } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

/**
 * Validates the request body against a concrete DTO class. Use on routes where
 * the global {@link import('@nestjs/common').ValidationPipe} may not resolve
 * `metatype` metadata reliably; it chains after global pipes.
 */
export class BodyDtoPipe implements PipeTransform {
  constructor(private readonly dtoClass: Type<unknown>) {}

  async transform(value: unknown): Promise<unknown> {
    const object = plainToInstance(this.dtoClass, value ?? {}, {
      enableImplicitConversion: true,
    });
    const errors = await validate(object as object, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    if (errors.length > 0) {
      const messages = errors.flatMap((e) =>
        e.constraints ? Object.values(e.constraints) : [],
      );
      throw new BadRequestException(messages.length ? messages : errors);
    }
    return object;
  }
}
