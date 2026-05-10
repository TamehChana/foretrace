import { SetMetadata } from '@nestjs/common';
import type { Role } from '@prisma/client';

/** Metadata key consumed by `RolesGuard`. */
export const ROLES_KEY = 'foretrace.requiredRoles';

/** Required `Membership.role` values. Use with no args (`@Roles()`) to allow any member of the org. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
