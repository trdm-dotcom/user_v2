import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { UserStatus } from '../enum/UserStatus';

@Entity()
export default class User {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ name: 'name' })
  name: string;
  @Column({ name: 'username' })
  username: string;
  @Column({ name: 'password' })
  password: string;
  @Column({ name: 'phone_number' })
  phoneNumber: string;
  @Column({ name: 'phone_verified' })
  phoneVerified: boolean;
  @Column({
    name: 'status',
    type: 'enum',
    enum: UserStatus,
    default: UserStatus.ACTIVE,
  })
  status: UserStatus;
  @Column({ name: 'device_token' })
  deviceToken: string;
  @Column({ name: 'birth_day' })
  birthDay: Date;
  @Column({ name: 'avatar' })
  avatar: string;
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
