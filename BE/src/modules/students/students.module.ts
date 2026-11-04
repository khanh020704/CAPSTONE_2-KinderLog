import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { ParentStudentMap } from './entities/parent-student-map.entity';
import { Student } from './entities/student.entity';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';

@Module({
  imports: [TypeOrmModule.forFeature([Student, ParentStudentMap, User])],
  controllers: [StudentsController],
  providers: [StudentsService],
})
export class StudentsModule {}
