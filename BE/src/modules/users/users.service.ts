import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Brackets, Not, Repository } from 'typeorm';
import { AuthUser } from '../../common/decorators';
import { RecordStatus, UserRole } from '../../common/enums';
import { foldSearch, likeFolded } from '../../common/utils/sql.util';
import { AccessService } from '../access/access.service';
import { ClassEntity } from '../classes/entities/class.entity';
import { DailyJournal } from '../daily-journals/entities/daily-journal.entity';
import { ClassJournal } from '../daily-journals/entities/class-journal.entity';
import { JournalPhoto } from '../daily-journals/entities/journal-photo.entity';
import { Message } from '../messages/entities/message.entity';
import { ParentStudentMap } from '../students/entities/parent-student-map.entity';
import {
  CreateUserDto,
  ListUsersQueryDto,
  UpdateProfileDto,
  UpdateStatusDto,
  UpdateUserDto,
} from './dto/user.dto';
import { User } from './entities/user.entity';

/** Which roles each role may create and manage. */
const MANAGEABLE: Record<UserRole, UserRole[]> = {
  [UserRole.SYSTEM_ADMIN]: [UserRole.SYSTEM_ADMIN, UserRole.PRINCIPAL, UserRole.TEACHER, UserRole.PARENT],
  [UserRole.PRINCIPAL]: [UserRole.TEACHER, UserRole.PARENT],
  [UserRole.TEACHER]: [],
  [UserRole.PARENT]: [],
};

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(ClassEntity) private readonly classes: Repository<ClassEntity>,
    @InjectRepository(ParentStudentMap) private readonly links: Repository<ParentStudentMap>,
    private readonly access: AccessService,
    private readonly config: ConfigService,
  ) {}

  hash(password: string) {
    return bcrypt.hash(password, this.config.get<number>('bcryptRounds') ?? 10);
  }

  /** The signed-in user plus what their role works with (homeroom classes, children). */
  async profile(id: string) {
    const user = await this.users.findOneOrFail({ where: { id }, relations: { school: true } });
    const extra: Record<string, unknown> = {};
    if (user.role === UserRole.TEACHER) {
      extra.classes = await this.classes.find({ where: { homeroomTeacherId: id }, order: { name: 'ASC' } });
    }
    if (user.role === UserRole.PARENT) {
      const links = await this.links.find({
        where: { parentId: id, status: RecordStatus.ACTIVE },
        relations: { student: { class: true } },
      });
      extra.children = links.map((l) => ({
        ...l.student,
        relationship: l.relationship,
        isPrimary: l.isPrimary,
      }));
    }
    return { ...user, ...extra };
  }

  async list(actor: AuthUser, q: ListUsersQueryDto) {
    const schoolId = this.access.schoolOf(actor, q.schoolId);
    const qb = this.users
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.school', 'school')
      .orderBy('u.fullName', 'ASC');
    if (schoolId) qb.andWhere('u.schoolId = :schoolId', { schoolId });
    if (q.role) qb.andWhere('u.role = :role', { role: q.role });
    if (q.status) qb.andWhere('u.status = :status', { status: q.status });
    if (actor.role === UserRole.PRINCIPAL)
      qb.andWhere('u.role IN (:...roles)', { roles: MANAGEABLE[actor.role] });
    if (q.search) {
      const s = foldSearch(q.search);
      qb.andWhere(
        new Brackets((w) =>
          w
            .where(likeFolded('u.fullName', 's'), { s })
            .orWhere('u.phone LIKE :s', { s })
            .orWhere('u.email LIKE :s', { s }),
        ),
      );
    }
    return qb.getMany();
  }

  async findOne(actor: AuthUser, id: string) {
    const user = await this.users.findOne({ where: { id }, relations: { school: true } });
    if (!user) throw new NotFoundException('User not found');
    this.assertManageable(actor, user.role, user.schoolId);
    return user;
  }

  async create(actor: AuthUser, dto: CreateUserDto) {
    const schoolId =
      dto.role === UserRole.SYSTEM_ADMIN ? null : this.access.requireSchool(actor, dto.schoolId);
    this.assertManageable(actor, dto.role, schoolId);
    await this.assertPhoneFree(dto.phone);

    const { password, ...rest } = dto;
    const saved = await this.users.save(
      this.users.create({
        ...rest,
        schoolId,
        passwordHash: await this.hash(password ?? this.config.get<string>('defaultPassword')!),
      }),
    );
    return this.findOne(actor, saved.id);
  }

  async update(actor: AuthUser, id: string, dto: UpdateUserDto) {
    const user = await this.findOne(actor, id);
    if (dto.phone && dto.phone !== user.phone) await this.assertPhoneFree(dto.phone, id);
    // Only the System Admin moves accounts between schools (e.g. assigning a principal).
    if (dto.schoolId !== undefined && actor.role !== UserRole.SYSTEM_ADMIN) delete dto.schoolId;
    await this.users.update(id, dto);
    return this.findOne(actor, id);
  }

  async updateProfile(actor: AuthUser, dto: UpdateProfileDto) {
    await this.users.update(actor.id, dto);
    return this.profile(actor.id);
  }

  async setStatus(actor: AuthUser, id: string, dto: UpdateStatusDto) {
    if (id === actor.id) throw new BadRequestException('You cannot change the status of your own account');
    await this.findOne(actor, id);
    await this.users.update(id, { status: dto.status });
    return this.findOne(actor, id);
  }

  /** For users who forgot their password: back to the initial one, as in the FE. */
  async resetPassword(actor: AuthUser, id: string) {
    await this.findOne(actor, id);
    await this.users.update(id, {
      passwordHash: await this.hash(this.config.get<string>('defaultPassword')!),
    });
    return { success: true, message: 'Password reset to the initial password' };
  }

  async remove(actor: AuthUser, id: string) {
    if (id === actor.id) throw new BadRequestException('You cannot delete your own account');
    await this.findOne(actor, id);
    // SQL Server allows only one cascade path per table, so the "who did it" references and the messages are
    // handled here instead of by ON DELETE rules; parent_student_map and notifications still cascade,
    // announcements and audit entries keep their rows (author / user → NULL).
    await this.users.manager.transaction(async (tx) => {
      await tx.update(ClassEntity, { homeroomTeacherId: id }, { homeroomTeacherId: null });
      await tx.update(DailyJournal, { createdById: id }, { createdById: null });
      await tx.update(DailyJournal, { approvedById: id }, { approvedById: null });
      await tx.update(DailyJournal, { publishedById: id }, { publishedById: null });
      await tx.update(ClassJournal, { createdById: id }, { createdById: null });
      await tx.update(ClassJournal, { updatedById: id }, { updatedById: null });
      await tx.update(JournalPhoto, { uploadedById: id }, { uploadedById: null });
      await tx.delete(Message, { senderId: id });
      await tx.delete(Message, { receiverId: id });
      await tx.delete(User, id);
    });
    return { success: true };
  }

  private assertManageable(actor: AuthUser, role: UserRole, schoolId: string | null) {
    if (!MANAGEABLE[actor.role].includes(role)) {
      throw new ForbiddenException(`A ${actor.role} cannot manage ${role} accounts`);
    }
    if (actor.role !== UserRole.SYSTEM_ADMIN && schoolId !== actor.schoolId) {
      throw new ForbiddenException('This account belongs to another school');
    }
  }

  private async assertPhoneFree(phone: string, exceptId?: string) {
    const taken = await this.users.exist({
      where: { phone: phone.trim(), ...(exceptId && { id: Not(exceptId) }) },
    });
    if (taken) throw new ConflictException('This phone number is already used by another account');
  }
}
