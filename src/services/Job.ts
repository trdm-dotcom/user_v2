import { Service } from 'typedi';
import User from '../models/entities/User';
import { In, Repository } from 'typeorm';
import { InjectRepository } from 'typeorm-typedi-extensions';
import { UserStatus } from '../models/enum/UserStatus';
import { v4 as uuid } from 'uuid';
import { getInstance } from './KafkaProducerService';
import { Utils } from 'common';
import Friend from '../models/entities/Friend';

@Service()
export default class Job {
  @InjectRepository(User)
  private userRepository: Repository<User>;
  @InjectRepository(Friend)
  private friendRepository: Repository<Friend>;

  public async finalDelete() {
    const users = await this.userRepository
      .createQueryBuilder('user')
      .where('user.status = :status', { status: UserStatus.INACTIVE })
      .andWhere('user.deletedAt < :deletedAt', { deletedAt: Utils.addTime(new Date(), 7, 'days') })
      .getMany();
    if (users.length > 0) {
      const userIds = users.map((user) => user.id);
      await this.friendRepository
        .createQueryBuilder('friend')
        .delete()
        .where({ sourceId: In(userIds) })
        .orWhere({ targetId: In(userIds) })
        .execute();
      await this.userRepository
        .createQueryBuilder('user')
        .delete()
        .where({ id: In(userIds) })
        .execute();
      getInstance().sendMessage(`${uuid()}`, 'core', 'internal:/api/v1/deleteAll', {
        userIds: userIds,
      });
    }
  }
}
