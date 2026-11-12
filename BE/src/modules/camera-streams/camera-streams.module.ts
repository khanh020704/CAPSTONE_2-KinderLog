import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClassEntity } from '../classes/entities/class.entity';
import { CameraStreamsController } from './camera-streams.controller';
import { CameraStreamsService } from './camera-streams.service';
import { User } from '../users/entities/user.entity';
import { CameraStream } from './entities/camera-stream.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CameraStream, ClassEntity, User])],
  controllers: [CameraStreamsController],
  providers: [CameraStreamsService],
  exports: [CameraStreamsService],
})
export class CameraStreamsModule {}
