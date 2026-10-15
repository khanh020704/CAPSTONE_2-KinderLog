import { Controller, Get, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Public } from './common/decorators';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { JwtAuthGuard, RolesGuard } from './common/guards';
import configuration, { envValidationSchema } from './config/configuration';
import { dataSourceOptions } from './database/data-source';
import { AccessModule } from './modules/access/access.service';
import { AuthModule } from './modules/auth/auth.module';
import { CacheModule } from './modules/cache/cache.service';
import { CameraStreamsModule } from './modules/camera-streams/camera-streams.module';
import { ClassesModule } from './modules/classes/classes.module';
import { DailyJournalsModule } from './modules/daily-journals/daily-journals.module';
import { ReportsModule } from './modules/reports/reports.module';
import { SchoolsModule } from './modules/schools/schools.module';
import { StudentsModule } from './modules/students/students.module';
import { UsersModule } from './modules/users/users.module';

@Controller('health')
class HealthController {
  constructor(
    private readonly db: DataSource,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Get()
  async check() {
    await this.db.query('SELECT 1');
    return { status: 'ok', db: 'up', aiMode: this.config.get('ai.mode'), time: new Date().toISOString() };
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration], validationSchema: envValidationSchema }),
    TypeOrmModule.forRoot({ ...dataSourceOptions, autoLoadEntities: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    CacheModule,
    AccessModule,
    AuthModule,
    SchoolsModule,
    UsersModule,
    ClassesModule,
    StudentsModule,
    DailyJournalsModule,
    CameraStreamsModule,
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
