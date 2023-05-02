import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { FriendStatus } from '../enum/FriendStatus';

@Entity()
export default class Friend {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ name: 'sourceId' })
  sourceId: number;
  @Column({ name: 'targetId' })
  targetId: number;
  @Column({ name: 'status' })
  status: FriendStatus;
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
