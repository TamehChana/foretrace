import { Role } from '@prisma/client';
import { IsEmail, IsIn } from 'class-validator';

/** New members as **`DEVELOPER`** or **`PM`** only (no self-serve ADMIN escalation). */
export class InviteMemberDto {
  @IsEmail()
  email!: string;

  @IsIn([Role.DEVELOPER, Role.PM])
  role!: Role;
}
