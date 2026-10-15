import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { UserRole } from '../../common/enums';
import { AiPipelineService } from './ai/ai-pipeline.service';
import { DailyJournalsService } from './daily-journals.service';
import {
  ApproveJournalsDto,
  BulkJournalDto,
  ClassDayQueryDto,
  HistoryQueryDto,
  TextJournalDto,
  TimelineQueryDto,
  UploadPhotosDto,
  UpsertJournalDto,
  VoiceJournalDto,
} from './dto/journal.dto';
import { audioUpload, photoUpload, PHOTO_PUBLIC_PATH } from './upload.config';

const STAFF = [UserRole.PRINCIPAL, UserRole.TEACHER] as const;

@ApiTags('Daily Journals')
@ApiBearerAuth()
@Controller('daily-journals')
export class DailyJournalsController {
  private readonly uploadDir: string;

  constructor(
    private readonly journals: DailyJournalsService,
    private readonly ai: AiPipelineService,
    config: ConfigService,
  ) {
    this.uploadDir = config.get<string>('uploadDir')!;
  }

  // ---------------------------------------------------------------- read

  /** Class register for a day: roster + entries + summary (teacher's main screen). */
  @Roles(UserRole.SYSTEM_ADMIN, ...STAFF)
  @Get('class/:classId')
  classDay(
    @CurrentUser() user: AuthUser,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Query() q: ClassDayQueryDto,
  ) {
    return this.journals.classDay(user, classId, q.date);
  }

  /** Days with entries for a class (newest first) with logged / approved counts. */
  @Roles(UserRole.SYSTEM_ADMIN, ...STAFF)
  @Get('class/:classId/history')
  history(
    @CurrentUser() user: AuthUser,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Query() q: HistoryQueryDto,
  ) {
    return this.journals.history(user, classId, q);
  }

  /** Parent timeline of one child (parents only see APPROVED days). */
  @Get('timeline')
  timeline(@CurrentUser() user: AuthUser, @Query() q: TimelineQueryDto) {
    return this.journals.timeline(user, q);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.journals.findOne(user, id);
  }

  // ---------------------------------------------------------------- write

  /** Bulk logging: class-wide defaults + per-child exceptions, saved as DRAFT. */
  @Roles(...STAFF)
  @Post('bulk')
  bulk(@CurrentUser() user: AuthUser, @Body() dto: BulkJournalDto) {
    return this.journals.bulkUpsert(user, dto);
  }

  /** Create or edit one child's entry for a day (back to DRAFT). */
  @Roles(...STAFF)
  @Put('student/:studentId')
  upsertOne(
    @CurrentUser() user: AuthUser,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Body() dto: UpsertJournalDto,
  ) {
    return this.journals.upsertOne(user, studentId, dto);
  }

  /** DRAFT → APPROVED: from now on parents can see it. */
  @Roles(...STAFF)
  @Post('approve')
  approve(@CurrentUser() user: AuthUser, @Body() dto: ApproveJournalsDto) {
    return this.journals.approve(user, dto);
  }

  @Roles(...STAFF)
  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.journals.remove(user, id);
  }

  // ---------------------------------------------------------------- photos

  @Roles(...STAFF)
  @Post('photos')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('photos', 10, photoUpload()))
  addPhotos(
    @CurrentUser() user: AuthUser,
    @Body() dto: UploadPhotosDto,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.journals.addPhotos(user, dto, files, PHOTO_PUBLIC_PATH);
  }

  @Roles(...STAFF)
  @Delete('photos/:photoId')
  removePhoto(@CurrentUser() user: AuthUser, @Param('photoId', ParseUUIDPipe) photoId: string) {
    return this.journals.removePhoto(user, photoId, this.uploadDir);
  }

  // ---------------------------------------------------------------- AI

  /** Voice → Whisper → LLM → JSON draft. `apply=true` also saves it as DRAFT entries. */
  @Roles(...STAFF)
  @Post('ai/voice')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('audio', audioUpload()))
  voice(
    @CurrentUser() user: AuthUser,
    @Body() dto: VoiceJournalDto,
    @UploadedFile() audio: Express.Multer.File,
  ) {
    return this.ai.fromAudio(user, dto, audio);
  }

  /** Transcript (e.g. from the browser's Web Speech API) → LLM → JSON draft. */
  @Roles(...STAFF)
  @Post('ai/text')
  text(@CurrentUser() user: AuthUser, @Body() dto: TextJournalDto) {
    return this.ai.fromText(user, dto);
  }
}
