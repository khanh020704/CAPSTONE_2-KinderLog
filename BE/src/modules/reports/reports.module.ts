import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CameraStream } from '../camera-streams/entities/camera-stream.entity';
import { ClassEntity } from '../classes/entities/class.entity';
import { ClassJournal } from '../daily-journals/entities/class-journal.entity';
import { DailyJournal } from '../daily-journals/entities/daily-journal.entity';
import { School } from '../schools/entities/school.entity';
import { Student } from '../students/entities/student.entity';
import { User } from '../users/entities/user.entity';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([DailyJournal, ClassJournal, ClassEntity, Student, User, School, CameraStream]),
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
