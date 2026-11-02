import { Controller, Get, HttpStatus, Logger, Module, Res } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { Response } from 'express';
import { DataSource } from 'typeorm';
import { Public } from './common/decorators';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { JwtAuthGuard, RolesGuard } from './common/guards';
import configuration, { envValidationSchema } from './config/configuration';
import { dataSourceOptions } from './database/data-source';
import { AcademicYearsModule } from './modules/academic-years/academic-years.module';
import { AccessModule } from './modules/access/access.service';
import { AnnouncementsModule } from './modules/announcements/announcements.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
import { AuthModule } from './modules/auth/auth.module';
import { CacheModule } from './modules/cache/cache.service';
import { CameraStreamsModule } from './modules/camera-streams/camera-streams.module';
import { ClassesModule } from './modules/classes/classes.module';
import { aiReadiness } from './modules/daily-journals/ai/ai-readiness';
import { DailyJournalsModule } from './modules/daily-journals/daily-journals.module';
import { MessagesModule } from './modules/messages/messages.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ReportsModule } from './modules/reports/reports.module';
import { SchoolsModule } from './modules/schools/schools.module';
import { mediaStorageKind, MediaStorageModule } from './modules/storage/media-storage.service';
import { StudentsModule } from './modules/students/students.module';
import { SystemModule } from './modules/system/system.module';
import { UsersModule } from './modules/users/users.module';

const DB_ENGINE: Record<string, string> = { mssql: 'SQL Server' };

@Controller('health')
class HealthController {
  private readonly logger = new Logger('Health');

  constructor(
    private readonly db: DataSource,
    private readonly config: ConfigService,
  ) {}

  /** Liveness of the API plus a `SELECT 1` ping to the database; 503 (with `db: 'down'`) when the database is unreachable. */
  @Public()
  @Get()
  async check(@Res({ passthrough: true }) res: Response) {
    const base = {
      dbEngine: DB_ENGINE[this.db.options.type] ?? this.db.options.type,
      aiMode: this.config.get<string>('ai.mode'),
      ai: aiReadiness(this.config),
      mediaStorage: mediaStorageKind(),
      // ImageKit files are handed out as signed URLs (recordings are private files)
      signedMediaUrls: mediaStorageKind() === 'imagekit',
      time: new Date().toISOString(),
    };
    const started = Date.now();
    try {
      await this.db.query('SELECT 1 AS ok');
      return { status: 'ok', db: 'up', dbLatencyMs: Date.now() - started, ...base };
    } catch (e) {
      this.logger.error(`Database ping failed: ${(e as Error).message}`);
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
      return { status: 'error', db: 'down', ...base };
    }
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration], validationSchema: envValidationSchema }),
    TypeOrmModule.forRoot({ ...dataSourceOptions, autoLoadEntities: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    CacheModule,
    MediaStorageModule,
    AccessModule,
    AuthModule,
    SchoolsModule,
    UsersModule,
    ClassesModule,
    StudentsModule,
    DailyJournalsModule,
    CameraStreamsModule,
    SystemModule,
    AcademicYearsModule,
    AnnouncementsModule,
    NotificationsModule,
    MessagesModule,
    AuditLogsModule,
    ReportsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
