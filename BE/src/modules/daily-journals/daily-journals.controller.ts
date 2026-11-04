import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { UserRole } from '../../common/enums';
import { ClassJournalsService } from './class-journals.service';
import { DailyJournalsService } from './daily-journals.service';
import {
  AttendanceQueryDto,
  BulkJournalDto,
  ClassDayQueryDto,
  TimelineQueryDto,
  UpsertJournalDto,
} from './dto/journal.dto';
import { ParseGuidPipe } from '../../common/validators/guid';

const STAFF = [UserRole.PRINCIPAL, UserRole.TEACHER] as const;

/**
 * Each child's record of a day: attendance (the register). The day's journal itself is the class journal
 * (/class-journals); parents read both through the timeline below.
 */
@ApiTags('Daily Journals')
@ApiBearerAuth()
@Controller('daily-journals')
export class DailyJournalsController {
  constructor(
    private readonly journals: DailyJournalsService,
    private readonly classJournals: ClassJournalsService,
  ) {}

  // ---------------------------------------------------------------- read

  /** Class register for a day: roster + each child's entry + summary, and the day's class journal. */
  @Roles(UserRole.SYSTEM_ADMIN, ...STAFF)
  @Get('class/:classId')
  classDay(
    @CurrentUser() user: AuthUser,
    @Param('classId', ParseGuidPipe) classId: string,
    @Query() q: ClassDayQueryDto,
  ) {
    return this.journals.classDay(user, classId, q.date);
  }

  /** A child's attendance for a day, as soon as the teacher saves it (the journal may not be published yet). */
  @Get('attendance')
  attendance(@CurrentUser() user: AuthUser, @Query() q: AttendanceQueryDto) {
    return this.journals.attendance(user, q.studentId, q.date);
  }

  /** A child's days: the class journal as published (with only this child's note) and the child's attendance. */
  @Get('timeline')
  timeline(@CurrentUser() user: AuthUser, @Query() q: TimelineQueryDto) {
    return this.classJournals.timeline(user, q);
  }

  @Roles(UserRole.SYSTEM_ADMIN, ...STAFF)
  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id', ParseGuidPipe) id: string) {
    return this.journals.findOne(user, id);
  }

  // ---------------------------------------------------------------- write

  /** The register for the whole class at once: class-wide values + per-child exceptions. */
  @Roles(...STAFF)
  @Post('bulk')
  bulk(@CurrentUser() user: AuthUser, @Body() dto: BulkJournalDto) {
    return this.journals.bulkUpsert(user, dto);
  }

  /** Create or edit one child's entry for a day (the attendance page). */
  @Roles(...STAFF)
  @Put('student/:studentId')
  upsertOne(
    @CurrentUser() user: AuthUser,
    @Param('studentId', ParseGuidPipe) studentId: string,
    @Body() dto: UpsertJournalDto,
  ) {
    return this.journals.upsertOne(user, studentId, dto);
  }

  @Roles(...STAFF)
  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseGuidPipe) id: string) {
    return this.journals.remove(user, id);
  }
}
