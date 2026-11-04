import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { UserRole } from '../../common/enums';
import { AiPipelineService } from './ai/ai-pipeline.service';
import { ClassJournalsService } from './class-journals.service';
import {
  AddRecordingDto,
  CreateClassJournalDto,
  JournalListQueryDto,
  TranscribeDto,
  UpdateClassJournalDto,
  VoiceDraftDto,
} from './dto/class-journal.dto';
import { audioUpload, photoUpload } from './upload.config';
import { ParseGuidPipe } from '../../common/validators/guid';
import { MediaStorageService } from '../storage/media-storage.service';

const STAFF = [UserRole.PRINCIPAL, UserRole.TEACHER] as const;

/**
 * The class journal of a day: six sections for every parent of the class, plus a private note per child.
 * DRAFT (manual) / REVIEW (voice) → approve → APPROVED → publish → PUBLISHED. Parents read it through
 * GET /daily-journals/timeline, which only ever shows the published version.
 */
@ApiTags('Daily Journals')
@ApiBearerAuth()
@Controller('class-journals')
export class ClassJournalsController {
  constructor(
    private readonly journals: ClassJournalsService,
    private readonly ai: AiPipelineService,
    private readonly media: MediaStorageService,
  ) {}

  /** A class's journals, newest first. status=review covers journals waiting for approval or publishing. */
  @Roles(UserRole.SYSTEM_ADMIN, ...STAFF)
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: JournalListQueryDto) {
    return this.journals.list(user, q);
  }

  /** Photos for a journal: stored and returned as addresses, which PUT /class-journals/:id then saves. */
  @Roles(UserRole.SYSTEM_ADMIN, ...STAFF)
  @Post('photos')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('photos', 10, photoUpload()))
  async photos(@UploadedFiles() files: Express.Multer.File[]) {
    if (!files?.length) throw new BadRequestException('Attach at least one image in the "photos" field');
    return { urls: await this.media.saveAll(files, 'photos') };
  }

  /** Recording → text (Whisper knows the children's names; the browser's transcript is the fallback). */
  @Roles(...STAFF)
  @Post('transcribe')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('audio', audioUpload()))
  transcribe(
    @CurrentUser() user: AuthUser,
    @Body() dto: TranscribeDto,
    @UploadedFile() audio?: Express.Multer.File,
  ) {
    return this.ai.transcribe(user, dto, audio);
  }

  /** The text the teacher checked → { sections, personal, issues }. Nothing is saved. */
  @Roles(...STAFF)
  @Post('voice-draft')
  voiceDraft(@CurrentUser() user: AuthUser, @Body() dto: VoiceDraftDto) {
    return this.ai.voiceDraft(user, dto);
  }

  @Roles(UserRole.SYSTEM_ADMIN, ...STAFF)
  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseGuidPipe) id: string) {
    return this.journals.get(user, id);
  }

  @Roles(...STAFF)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateClassJournalDto) {
    return this.journals.create(user, dto);
  }

  @Roles(...STAFF)
  @Put(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseGuidPipe) id: string,
    @Body() dto: UpdateClassJournalDto,
  ) {
    return this.journals.update(user, id, dto);
  }

  @Roles(...STAFF)
  @Post(':id/approve')
  approve(@CurrentUser() user: AuthUser, @Param('id', ParseGuidPipe) id: string) {
    return this.journals.approve(user, id);
  }

  @Roles(...STAFF)
  @Post(':id/publish')
  publish(@CurrentUser() user: AuthUser, @Param('id', ParseGuidPipe) id: string) {
    return this.journals.publish(user, id);
  }

  /** Another recording, added to the draft (POST /class-journals/voice-draft with journalId first). */
  @Roles(...STAFF)
  @Post(':id/recordings')
  addRecording(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseGuidPipe) id: string,
    @Body() dto: AddRecordingDto,
  ) {
    return this.journals.addRecording(user, id, dto);
  }
}
