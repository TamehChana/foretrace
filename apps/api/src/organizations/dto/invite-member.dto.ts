import { Role } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEmail, IsIn } from 'class-validator';

/** New members as **`DEVELOPER`** or **`PM`** only (no self-serve ADMIN escalation). */
export class InviteMemberDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email!: string;

  @IsIn([Role.DEVELOPER, Role.PM])
  role!: Role;
}
