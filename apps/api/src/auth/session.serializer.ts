import { Injectable } from '@nestjs/common';
import { PassportSerializer } from '@nestjs/passport';

import { AuthService } from './auth.service';

@Injectable()
export class SessionSerializer extends PassportSerializer {
  constructor(private readonly authService: AuthService) {
    super();
  }

  serializeUser(
    user: Express.User,
    done: (err: Error | null, id?: string) => void,
  ): void {
    done(undefined, user.id);
  }

  deserializeUser(
    payload: unknown,
    done: (err: Error | undefined, user?: Express.User | false) => void,
  ): void {
    if (typeof payload !== 'string' || payload.length === 0) {
      done(undefined, false);
      return;
    }

    void this.authService
      .findSessionUser(payload)
      .then((user) => {
        done(undefined, user ?? false);
      })
      .catch(() => {
        done(undefined, false);
      });
  }
}
