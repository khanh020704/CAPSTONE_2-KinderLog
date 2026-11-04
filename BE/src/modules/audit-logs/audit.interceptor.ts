import { CallHandler, ExecutionContext, HttpException, Injectable, NestInterceptor } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { catchError, Observable, tap, throwError } from 'rxjs';
import { AuthUser } from '../../common/decorators';
import { AuditAction, AuditStatus } from '../../common/enums';
import { AuditLogsService } from './audit-logs.service';

/** First path segment after /api → module name shown in the audit log. Segments not listed are not audited. */
const MODULES: Record<string, string> = {
  auth: 'Authentication',
  schools: 'Schools',
  users: 'Accounts',
  classes: 'Classes',
  students: 'Students',
  'daily-journals': 'Daily Journal',
  'class-journals': 'Daily Journal',
  'camera-streams': 'Cameras',
  'academic-years': 'Academic Years',
  announcements: 'School Announcements',
  notifications: 'Notifications',
  'audit-logs': 'Audit Logs',
  system: 'System Settings',
  'attribute-fields': 'Attribute Fields',
};

/** Last path segment of a POST / PUT / PATCH → action; otherwise the HTTP method decides. */
const SEGMENT_ACTIONS: Record<string, AuditAction> = {
  login: AuditAction.LOGIN,
  'change-password': AuditAction.CHANGE_PASSWORD,
  approve: AuditAction.APPROVE,
  publish: AuditAction.PUBLISH,
  status: AuditAction.STATUS,
  'reset-password': AuditAction.RESET_PASSWORD,
  photos: AuditAction.UPLOAD,
  avatar: AuditAction.UPLOAD,
  bulk: AuditAction.BULK_SAVE,
  transcribe: AuditAction.AI_DRAFT,
  'voice-draft': AuditAction.AI_DRAFT,
  recordings: AuditAction.AI_DRAFT,
  parents: AuditAction.LINK,
};
const METHOD_ACTIONS: Record<string, AuditAction> = {
  POST: AuditAction.CREATE,
  PUT: AuditAction.UPDATE,
  PATCH: AuditAction.UPDATE,
  DELETE: AuditAction.DELETE,
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Body = Record<string, unknown> | undefined;
/** Only these fields are ever read from a request or response: never passwords, tokens or message text. */
const labelOf = (b: Body) => {
  const v = b && (b.fullName ?? b.name ?? b.title);
  return typeof v === 'string' ? v.slice(0, 120) : undefined;
};

/**
 * Records every write request (POST / PUT / PATCH / DELETE) of the modules above, successful or not, plus sign-in
 * attempts. Private traffic is left out: messages, and reading / clearing one's own notifications.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly prefix: string;

  constructor(
    private readonly audit: AuditLogsService,
    config: ConfigService,
  ) {
    this.prefix = config.get<string>('apiPrefix') ?? 'api';
  }

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    if (!METHOD_ACTIONS[req.method]) return next.handle();
    const segments = req.path
      .replace(new RegExp(`^/${this.prefix}/`), '')
      .split('/')
      .filter(Boolean);
    const module = MODULES[segments[0]];
    const personal = segments[0] === 'notifications' && segments.length > 1;
    if (!module || personal) return next.handle();

    const last = segments.filter((s) => !UUID.test(s)).pop() ?? '';
    // A DELETE is a deletion whatever the path (e.g. removing a photo), except unlinking a parent.
    const action =
      req.method === 'DELETE'
        ? last === 'parents'
          ? AuditAction.UNLINK
          : AuditAction.DELETE
        : (SEGMENT_ACTIONS[last] ?? METHOD_ACTIONS[req.method]);
    const targetId = [...segments].reverse().find((s) => UUID.test(s));
    const isLogin = action === AuditAction.LOGIN;
    const rawPhone = (req.body as Body)?.phone;
    const phone = isLogin && typeof rawPhone === 'string' ? rawPhone.slice(0, 20) : undefined;

    const write = (status: number, response: Body, error?: string) => {
      const actor = isLogin ? (response?.user as AuthUser | undefined) : req.user;
      if (!actor && !isLogin) return; // anonymous request rejected by the auth guard: nothing to attribute
      const label =
        labelOf(req.body as Body) ??
        labelOf(response) ??
        (targetId && `#${targetId.slice(0, 8)}`) ??
        (segments[0] === 'system' ? 'platform settings' : undefined);
      const what = isLogin
        ? `Sign-in ${phone ?? ''}`.trim()
        : `${action.replace(/_/g, ' ').toLowerCase()}${label ? `: ${label}` : ''}`;
      void this.audit.record({
        userId: actor?.id ?? null,
        schoolId: actor?.schoolId ?? null,
        userName: actor?.fullName ?? null,
        userRole: actor?.role ?? null,
        action,
        module,
        description: error ? `${what} — ${error}` : what,
        status: status >= 400 ? AuditStatus.FAILED : AuditStatus.SUCCESS,
        httpStatus: status,
        ipAddress: req.ip?.slice(0, 45) ?? null,
      });
    };

    return next.handle().pipe(
      tap((body: unknown) => write(ctx.switchToHttp().getResponse<Response>().statusCode, body as Body)),
      catchError((err: unknown) => {
        const status = err instanceof HttpException ? err.getStatus() : 500;
        const message = err instanceof HttpException ? err.message : 'Internal error';
        write(status, undefined, message);
        return throwError(() => err);
      }),
    );
  }
}
