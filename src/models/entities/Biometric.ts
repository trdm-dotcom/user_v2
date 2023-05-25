import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { BiometricStatus } from '../enum/BiometricStatus';

@Entity()
export default class Biometric {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ name: 'user_id' })
  userid: number;
  @Column({ name: 'username' })
  username: string;
  @Column({ name: 'secret_key' })
  secretKey: string;
  @Column({ name: 'public_key' })
  publicKey: string;
  @Column({ name: 'is_deleted' })
  isDeleted: boolean;
  @Column({ name: 'delete_reason' })
  deleteReason: string;
  @Column({ name: 'status' })
  status: BiometricStatus;
  @Column({ name: 'deviceId' })
  deviceId: string;
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
