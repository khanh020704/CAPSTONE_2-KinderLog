import { ForbiddenException, Global, Injectable, Module, NotFoundException } from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthUser } from '../../common/decorators';
import { RecordStatus, UserRole } from '../../common/enums';
import { ClassEntity } from '../classes/entities/class.entity';
import { ParentStudentMap } from '../students/entities/parent-student-map.entity';
import { Student } from '../students/entities/student.entity';

/**
 * Row-level authorisation shared by every module (multi-tenant + ownership):
 *  - SYSTEM_ADMIN: everything
 *  - PRINCIPAL:    only rows of their own school
 *  - TEACHER:      only classes where they are the homeroom teacher
 *  - PARENT:       only their linked children (and those children's classes)
 */
@Injectable()
export class AccessService {
  constructor(
    @InjectRepository(ClassEntity) private readonly classes: Repository<ClassEntity>,
    @InjectRepository(Student) private readonly students: Repository<Student>,
    @InjectRepository(ParentStudentMap) private readonly links: Repository<ParentStudentMap>,
  ) {}

  /** The school a non-admin user is bound to; admins may pass one explicitly. */
  schoolOf(user: AuthUser, requested?: string): string | undefined {
    if (user.role === UserRole.SYSTEM_ADMIN) return requested;
    if (!user.schoolId) throw new ForbiddenException('Account is not attached to a school');
    return user.schoolId;
  }

  requireSchool(user: AuthUser, requested?: string): string {
    const id = this.schoolOf(user, requested);
    if (!id) throw new ForbiddenException('schoolId is required');
    return id;
  }

  async assertClass(user: AuthUser, classId: string): Promise<ClassEntity> {
    const cls = await this.classes.findOne({ where: { id: classId } });
    if (!cls) throw new NotFoundException('Class not found');
    if (!(await this.canSeeClass(user, cls)))
      throw new ForbiddenException('You do not have access to this class');
    return cls;
  }

  /** Teachers may only write journals for their own homeroom class (principals may correct any class of their school). */
  async assertClassWritable(user: AuthUser, classId: string): Promise<ClassEntity> {
    const cls = await this.assertClass(user, classId);
    if (user.role === UserRole.PARENT) throw new ForbiddenException('Parents cannot edit journals');
    return cls;
  }

  async assertStudent(user: AuthUser, studentId: string): Promise<Student> {
    const student = await this.students.findOne({ where: { id: studentId }, relations: { class: true } });
    if (!student) throw new NotFoundException('Student not found');
    const ok =
      user.role === UserRole.PARENT
        ? await this.links.exist({ where: { parentId: user.id, studentId, status: RecordStatus.ACTIVE } })
        : await this.canSeeClass(user, student.class);
    if (!ok) throw new ForbiddenException('You do not have access to this student');
    return student;
  }

  /** Class ids a teacher or parent works with; undefined means "no restriction inside the school". */
  async visibleClassIds(user: AuthUser): Promise<string[] | undefined> {
    if (user.role === UserRole.TEACHER) {
      const rows = await this.classes.find({ where: { homeroomTeacherId: user.id }, select: { id: true } });
      return rows.map((r) => r.id);
    }
    if (user.role === UserRole.PARENT) {
      const rows = await this.links.find({
        where: { parentId: user.id, status: RecordStatus.ACTIVE },
        relations: { student: true },
      });
      return [...new Set(rows.map((r) => r.student.classId))];
    }
    return undefined;
  }

  private async canSeeClass(user: AuthUser, cls: ClassEntity): Promise<boolean> {
    switch (user.role) {
      case UserRole.SYSTEM_ADMIN:
        return true;
      case UserRole.PRINCIPAL:
        return cls.schoolId === user.schoolId;
      case UserRole.TEACHER:
        return cls.homeroomTeacherId === user.id;
      case UserRole.PARENT:
        return (await this.visibleClassIds(user))!.includes(cls.id);
    }
  }
}

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([ClassEntity, Student, ParentStudentMap])],
  providers: [AccessService],
  exports: [AccessService],
})
export class AccessModule {}
