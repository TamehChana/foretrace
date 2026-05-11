import {
  Injectable,
  type PipeTransform,
  BadRequestException,
} from '@nestjs/common';

import type { TerminalIngestBatchInput } from '@foretrace/shared';
import { parseTerminalIngestBatch } from '@foretrace/shared';
import { ZodError } from 'zod';

@Injectable()
export class ParseTerminalIngestBatchPipe
  implements PipeTransform<unknown, TerminalIngestBatchInput>
{
  transform(value: unknown): TerminalIngestBatchInput {
    try {
      return parseTerminalIngestBatch(value);
    } catch (e) {
      if (e instanceof ZodError) {
        const msg = e.issues
          .map((i) => `${i.path.join('.') || 'payload'}: ${i.message}`)
          .join('; ');
        throw new BadRequestException(msg || 'Invalid ingest payload');
      }
      throw e;
    }
  }
}
