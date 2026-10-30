import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthUser } from '../../common/decorators';
import { UserRole } from '../../common/enums';
import { timeToMinutes } from '../../common/utils/date.util';
import { AccessService } from '../access/access.service';
import { ClassEntity } from '../classes/entities/class.entity';
import { User } from '../users/entities/user.entity';
import { availability } from './camera-schedule';
import {
  CreateCameraStreamDto,
  ListCameraStreamsQueryDto,
  UpdateCameraStreamDto,
  WatchQueryDto,
} from './dto/camera-stream.dto';
import { CameraStream } from './entities/camera-stream.entity';

@Injectable()
export class CameraStreamsService {
  private readonly tz: string;

  constructor(
    @InjectRepository(CameraStream) private readonly cameras: Repository<CameraStream>,
    @InjectRepository(ClassEntity) private readonly classes: Repository<ClassEntity>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly access: AccessService,
    config: ConfigService,
  ) {
    this.tz = config.get<string>('timezone')!;
  }

  /** A parent whose camera access the school turned off may not watch at all. */
  private async assertCameraAccess(user: AuthUser) {
    if (user.role !== UserRole.PARENT) return;
    const account = await this.users.findOne({
      where: { id: user.id },
      select: { id: true, cameraAccess: true },
    });
    if (!account?.cameraAccess) throw new ForbiddenException('Camera access is turned off for this account');
  }

  /** Staff view: every camera of the school (or teacher's class) with its live state and URL. */
  async list(user: AuthUser, q: ListCameraStreamsQueryDto) {
    if (q.classId) await this.access.assertClass(user, q.classId);
    const schoolId = this.access.schoolOf(user);
    const visible = await this.access.visibleClassIds(user);
    const qb = this.cameras
      .createQueryBuilder('cam')
      .innerJoin('cam.class', 'c')
      .addSelect(['c.id', 'c.name'])
      .orderBy('c.name', 'ASC')
      .addOrderBy('cam.name', 'ASC');
    if (schoolId) qb.andWhere('c.schoolId = :schoolId', { schoolId });
    if (visible) qb.andWhere(visible.length ? 'c.id IN (:...visible)' : '1=0', { visible });
    if (q.classId) qb.andWhere('cam.classId = :classId', { classId: q.classId });
    const rows = await qb.getMany();
    return rows.map((cam) => ({ ...cam, ...availability(cam, this.tz) }));
  }

  /**
   * Parent view of a child's class cameras. The stream URL is only included while the window is open;
   * outside it the parent gets the state and the next window, so the FE can show "Opens at 08:00".
   */
  async watch(user: AuthUser, q: WatchQueryDto) {
    await this.assertCameraAccess(user);
    let classId = q.classId;
    if (q.studentId) classId = (await this.access.assertStudent(user, q.studentId)).classId;
    if (!classId) throw new BadRequestException('studentId or classId is required');
    const cls = await this.access.assertClass(user, classId);

    const cams = await this.cameras.find({ where: { classId: cls.id }, order: { name: 'ASC' } });
    const staff = user.role !== UserRole.PARENT;
    return {
      class: { id: cls.id, name: cls.name },
      serverTime: new Date().toISOString(),
      timezone: this.tz,
      cameras: cams.map((cam) => {
        const a = availability(cam, this.tz);
        return {
          id: cam.id,
          name: cam.name,
          state: a.state,
          window: a.window,
          streamUrl: a.state === 'LIVE' || staff ? cam.streamUrl : null,
        };
      }),
    };
  }

  /** Single camera, same window rule; 403 for a parent outside the window. */
  async watchOne(user: AuthUser, id: string) {
    await this.assertCameraAccess(user);
    const cam = await this.findOne(user, id);
    const a = availability(cam, this.tz);
    if (user.role === UserRole.PARENT && a.state !== 'LIVE') {
      throw new ForbiddenException({
        message: 'The camera is not available at this time',
        state: a.state,
        window: a.window,
      });
    }
    return { id: cam.id, name: cam.name, streamUrl: cam.streamUrl, ...a };
  }

  async findOne(user: AuthUser, id: string) {
    const cam = await this.cameras.findOne({ where: { id } });
    if (!cam) throw new NotFoundException('Camera not found');
    await this.access.assertClass(user, cam.classId);
    return cam;
  }

  async create(user: AuthUser, dto: CreateCameraStreamDto) {
    await this.access.assertClass(user, dto.classId);
    this.assertWindow(dto.allowedStartTime, dto.allowedEndTime);
    return this.cameras.save(this.cameras.create(dto));
  }

  async update(user: AuthUser, id: string, dto: UpdateCameraStreamDto) {
    const cam = await this.findOne(user, id);
    if (dto.classId) await this.access.assertClass(user, dto.classId);
    this.assertWindow(dto.allowedStartTime ?? cam.allowedStartTime, dto.allowedEndTime ?? cam.allowedEndTime);
    await this.cameras.update(id, dto);
    return this.findOne(user, id);
  }

  async remove(user: AuthUser, id: string) {
    await this.findOne(user, id);
    await this.cameras.delete(id);
    return { success: true };
  }

  private assertWindow(start: string, end: string) {
    if (timeToMinutes(start) >= timeToMinutes(end)) {
      throw new BadRequestException('allowedEndTime must be after allowedStartTime');
    }
  }
}
