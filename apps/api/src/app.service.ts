import { Injectable } from '@nestjs/common';
import { API_NAME } from '@foretrace/shared';

@Injectable()
export class AppService {
  getHello(): string {
    return `${API_NAME} — Foretrace API online`;
  }
}
