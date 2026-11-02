import { IsDateString, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PageQueryDto } from '../../../common/dto/pagination.dto';
import { IsGuid } from '../../../common/validators/guid';

export class SendMessageDto {
  @IsGuid()
  receiverId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content: string;
}

export class EditMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content: string;
}

/** One conversation, newest first. `before` (ISO time) loads older pages without offsets shifting. */
export class ThreadQueryDto extends PageQueryDto {
  @IsOptional()
  @IsDateString()
  before?: string;
}
