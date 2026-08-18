import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { UserRole } from '@app/auth-kernel';

@Entity({ name: 'users' })
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ type: 'text', nullable: true })
  name: string | null;

  @Column({ name: 'phone_number', type: 'text', nullable: true })
  phoneNumber: string | null;

  @Column({ name: 'telegram_chat_id', type: 'text', nullable: true })
  telegramChatId: string | null;

  @Column({ name: 'password_hash' })
  passwordHash: string;

  @Column({ name: 'password_salt' })
  passwordSalt: string;

  @Column({ type: 'enum', enum: ['admin', 'user'], default: 'user' })
  role: UserRole;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
