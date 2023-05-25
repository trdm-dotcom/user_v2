import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { SocialType } from '../enum/SocialType';

@Entity()
export default class Social {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ name: 'user_id' })
  userid: number;
  @Column({ name: 'socical_type' })
  socicalType: SocialType;
  @Column({ name: 'socical_id' })
  socicalId: string;
  @Column({ name: 'profile_url' })
  profileUrl: string;
  @Column({ name: 'avatar_url' })
  avatarUrl: string;
  @CreateDateColumn({ name: 'create_at' })
  createAt: Date;
  @UpdateDateColumn({ name: 'update_at' })
  updateAt: Date;
}
