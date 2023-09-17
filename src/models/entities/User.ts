import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { UserStatus } from '../enum/UserStatus';

@Entity()
export default class User {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ name: 'name' })
  name: string;
  @Column({ name: 'password' })
  password: string;
  @Column({ name: 'phone_number', unique: true })
  phoneNumber: string;
  @Column({ name: 'email', unique: true })
  email: string;
  @Column({ name: 'phone_verified', default: false })
  phoneVerified: boolean;
  @Column({
    name: 'status',
    type: 'enum',
    enum: UserStatus,
    default: UserStatus.ACTIVE,
  })
  status: UserStatus;
  @Column({ name: 'birth_day', nullable: true })
  birthDay: Date;
  @Column({ name: 'avatar', nullable: true })
  avatar: string;
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
