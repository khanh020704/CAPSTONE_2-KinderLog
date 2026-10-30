import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsModule } from '../notifications/notifications.module';
import { ParentStudentMap } from '../students/entities/parent-student-map.entity';
import { Student } from '../students/entities/student.entity';
import { AiPipelineService } from './ai/ai-pipeline.service';
import { extractionProvider } from './ai/ai-readiness';
import { ClaudeJournalExtractor } from './ai/claude.extractor';
import { GroqJournalExtractor } from './ai/groq.extractor';
import { JOURNAL_EXTRACTOR } from './ai/journal-draft.schema';
import { RuleBasedJournalExtractor } from './ai/rule-based.extractor';
import { SpeechToTextService } from './ai/speech-to-text.service';
import { ClassJournalsController } from './class-journals.controller';
import { ClassJournalsService } from './class-journals.service';
import { DailyJournalsController } from './daily-journals.controller';
import { DailyJournalsService } from './daily-journals.service';
import { ClassJournal } from './entities/class-journal.entity';
import { ClassJournalNote } from './entities/class-journal-note.entity';
import { DailyJournal } from './entities/daily-journal.entity';
import { JournalPhoto } from './entities/journal-photo.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DailyJournal,
      ClassJournal,
      ClassJournalNote,
      JournalPhoto,
      Student,
      ParentStudentMap,
    ]),
    NotificationsModule,
  ],
  controllers: [ClassJournalsController, DailyJournalsController],
  providers: [
    DailyJournalsService,
    ClassJournalsService,
    SpeechToTextService,
    AiPipelineService,
    {
      // Groq (gpt-oss-120b) or Claude structured outputs when a key is set; otherwise, and for the automated
      // tests (AI_MODE=mock), the offline keyword rules.
      provide: JOURNAL_EXTRACTOR,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const provider = extractionProvider(config);
        if (provider === 'groq') return new GroqJournalExtractor(config);
        if (provider === 'claude') return new ClaudeJournalExtractor(config);
        return new RuleBasedJournalExtractor();
      },
    },
  ],
  exports: [DailyJournalsService, ClassJournalsService],
})
export class DailyJournalsModule {}
