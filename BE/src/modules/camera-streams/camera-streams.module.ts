import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClassEntity } from '../classes/entities/class.entity';
import { CameraStreamsController } from './camera-streams.controller';
import { CameraStreamsService } from './camera-streams.service';
import { CameraStream } from './entities/camera-stream.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CameraStream, ClassEntity])],
  controllers: [CameraStreamsController],
  providers: [CameraStreamsService],
  exports: [CameraStreamsService],
})
export class CameraStreamsModule {}
