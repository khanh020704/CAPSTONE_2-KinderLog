import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Student } from '../students/entities/student.entity';
import { AiPipelineService } from './ai/ai-pipeline.service';
import { ClaudeJournalExtractor } from './ai/claude.extractor';
import { JOURNAL_EXTRACTOR } from './ai/journal-draft.schema';
import { RuleBasedJournalExtractor } from './ai/rule-based.extractor';
import { SpeechToTextService } from './ai/speech-to-text.service';
import { DailyJournalsController } from './daily-journals.controller';
import { DailyJournalsService } from './daily-journals.service';
import { DailyJournal } from './entities/daily-journal.entity';
import { JournalPhoto } from './entities/journal-photo.entity';

@Module({
  imports: [TypeOrmModule.forFeature([DailyJournal, JournalPhoto, Student])],
  controllers: [DailyJournalsController],
  providers: [
    DailyJournalsService,
    SpeechToTextService,
    AiPipelineService,
    {
      // AI_MODE=live → Claude structured outputs; AI_MODE=mock → offline keyword rules (demo without keys).
      provide: JOURNAL_EXTRACTOR,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.get('ai.mode') === 'live'
          ? new ClaudeJournalExtractor(config)
          : new RuleBasedJournalExtractor(),
    },
  ],
  exports: [DailyJournalsService],
})
export class DailyJournalsModule {}
