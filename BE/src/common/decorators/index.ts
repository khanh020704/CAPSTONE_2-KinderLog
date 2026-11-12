import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import { UserRole } from '../enums';

export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';

/** Skip JWT authentication (login, health check). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Allow only these roles. Without @Roles any authenticated user passes the RolesGuard. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

/** What the JWT strategy attaches to `req.user`. */
export interface AuthUser {
  id: string;
  role: UserRole;
  schoolId: string | null;
  fullName: string;
}

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser =>
    ctx.switchToHttp().getRequest<Request & { user: AuthUser }>().user,
);
