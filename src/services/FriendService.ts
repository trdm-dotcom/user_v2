import { Inject, Service } from 'typedi';
import Friend from '../models/entities/Friend';
import { Brackets, EntityManager, In, Repository, SelectQueryBuilder } from 'typeorm';
import User from '../models/entities/User';
import IFriendRequest from '../models/request/IFriendRequest';
import { Errors, Logger, Utils } from 'common';
import * as utils from '../utils/Utils';
import Constants from '../Constants';
import { UserStatus } from '../models/enum/UserStatus';
import { FriendStatus } from '../models/enum/FriendStatus';
import { FirebaseType, IDataRequest } from 'common/build/src/modules/models';
import IFriendResponse from '../models/response/IFriendResponse';
import { ISuggestFriendRequest } from '../models/request/ISuggestFriendRequest';
import { InjectManager, InjectRepository } from 'typeorm-typedi-extensions';
import CacheService from './CacheService';
import { getInstance } from './KafkaProducerService';

@Service()
export default class FriendService {
  @Inject()
  private cacheService: CacheService;
  @InjectRepository(User)
  private userRepository: Repository<User>;
  @InjectRepository(Friend)
  private friendRepository: Repository<Friend>;
  @InjectManager()
  private manager: EntityManager;

  public async requestFriend(request: IFriendRequest, transactionId: string | number) {
    const userId: number = request.headers.token.userData.id;
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.friend, 'friend').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    try {
      while (
        (await this.cacheService.findInprogessValidate(request.friend, Constants.DISABLE_INPROGESS, transactionId)) ||
        (await this.cacheService.findInprogessValidate(request.friend, Constants.BLOCK_INPROGESS, transactionId))
      ) {
        Logger.warn(`${transactionId} waiting do progess`);
      }
      const user: User = await this.userRepository.findOne({
        phoneNumber: request.friend as string,
        status: UserStatus.ACTIVE,
      });
      if (user == null) {
        throw new Errors.GeneralError(Constants.USER_NOT_FOUND);
      }
      const friends: Friend[] = await this.friendRepository
        .createQueryBuilder('friend')
        .where("CONCAT(friend.sourceId, '_', friend.targetId) in (:concatid)", {
          concatid: [`${userId}_${user.id}`, `${user.id}_${userId}`],
        })
        .getMany();
      if (friends.map((v) => v.status).includes(FriendStatus.BLOCKED)) {
        throw new Errors.GeneralError(Constants.WAS_BLOCKED);
      }
      if (friends.length > 0) {
        throw new Errors.GeneralError(Constants.ALREADY_EXISTS);
      }
      const friend: Friend = new Friend();
      friend.sourceId = userId;
      friend.targetId = user.id;
      friend.status = FriendStatus.PENDING;
      await this.friendRepository.save(friend);
      utils.sendMessagePushNotification(
        transactionId.toString(),
        friend.targetId,
        'request friend',
        `${request.headers.token.userData.id} sent you a friend request`,
        'push_up',
        true,
        FirebaseType.TOKEN
      );
    } catch (error) {
      Logger.error(`${transactionId} Error:`, error);
      if (error instanceof Errors.GeneralError) {
        throw error;
      } else {
        throw new Errors.GeneralError();
      }
    }
    return {};
  }

  public async acceptFriend(request: IFriendRequest, transactionId: string | number) {
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.friend, 'friend').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    const userId: number = request.headers.token.userData.id;
    try {
      while (
        (await this.cacheService.findInprogessValidate(request.friend, Constants.DISABLE_INPROGESS, transactionId)) ||
        (await this.cacheService.findInprogessValidate(request.friend, Constants.BLOCK_INPROGESS, transactionId))
      ) {
        Logger.warn(`${transactionId} waiting do progess`);
      }
      const friend: Friend = await this.friendRepository.findOne({
        sourceId: request.friend as number,
        status: FriendStatus.PENDING,
      });
      if (friend == null) {
        throw new Errors.GeneralError(Constants.OBJECT_NOT_FOUND);
      }
      if (friend.targetId != userId) {
        throw new Errors.GeneralError(Constants.USER_DONT_HAVE_PERMISSION);
      }
      await this.friendRepository.update(
        { id: friend.id },
        {
          status: FriendStatus.FRIENDED,
        }
      );
      utils.sendMessagePushNotification(
        transactionId.toString(),
        friend.sourceId,
        'accepted request',
        `${request.headers.token.userData.id} accepted your friend request`,
        'push_up',
        true,
        FirebaseType.TOKEN
      );
    } catch (error) {
      Logger.error(`${transactionId} Error:`, error);
      if (error instanceof Errors.GeneralError) {
        throw error;
      } else {
        throw new Errors.GeneralError();
      }
    }
    return {};
  }

  public async rejectFriend(request: IFriendRequest, transactionId: string | number) {
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.friend, 'friend').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    const userId: number = request.headers.token.userData.id;
    const friend: Friend = await this.friendRepository.findOne(request.friend as number, {
      where: {
        status: FriendStatus.BLOCKED,
      },
    });
    if (friend == null) {
      throw new Errors.GeneralError(Constants.OBJECT_NOT_FOUND);
    }
    if (friend.sourceId != userId && friend.targetId != userId) {
      throw new Errors.GeneralError(Constants.USER_DONT_HAVE_PERMISSION);
    }
    this.friendRepository.delete({ id: request.friend as number });
    getInstance().sendMessage(`${transactionId}`, 'core', 'delete:/api/v1/chat/conversation/{roomId}', {
      recipientId: request.friend,
    });
    return {};
  }

  public async getRequestFriend(request: IFriendRequest, transactionId: string | number) {
    const userId: number = request.headers.token.userData.id;
    const limit = request.pageSize == null ? 20 : Math.min(request.pageSize, 100);
    const offset = request.pageNumber == null ? 0 : Math.max(request.pageNumber - 1, 0) * limit;
    const result: any[] = await this.findFriendBy(userId, FriendStatus.PENDING, offset, limit);
    return result.map(
      (v: any, i: number): IFriendResponse => ({
        id: v.id,
        name: v.name,
        status: v.status,
        avatar: v.avatar,
        phoneNumber: v.phoneNumber,
        birthDay: v.birthDay,
      })
    );
  }

  public async getFriend(request: IFriendRequest, transactionId: string | number) {
    const userId: number = request.headers.token.userData.id;
    const limit = request.pageSize == null ? 20 : Math.min(request.pageSize, 100);
    const offset = request.pageNumber == null ? 0 : Math.max(request.pageNumber - 1, 0) * limit;
    const result: any[] = await this.findFriendBy(userId, FriendStatus.FRIENDED, offset, limit);
    return result.map(
      (v: any, i: number): IFriendResponse => ({
        id: v.id,
        name: v.name,
        status: v.status,
        avatar: v.avatar,
        phoneNumber: v.phoneNumber,
        birthDay: v.birthDay,
      })
    );
  }

  public async getBlockFriend(request: IFriendRequest, transactionId: string | number) {
    const userId: number = request.headers.token.userData.id;
    const limit = request.pageSize == null ? 20 : Math.min(request.pageSize, 100);
    const offset = request.pageNumber == null ? 0 : Math.max(request.pageNumber - 1, 0) * limit;
    const result: any[] = await this.friendRepository
      .createQueryBuilder('friend')
      .innerJoinAndSelect('user', 'user', 'user.id = friend.sourceId or user.id = friend.targetId')
      .where('friend.targetId = :userId and user.id != :userId and friend.status = :status', {
        userId: userId,
        status: FriendStatus.BLOCKED,
      })
      .skip(offset)
      .take(limit)
      .getMany();
    return result.map(
      (v: any, i: number): IFriendResponse => ({
        id: v.id,
        name: v.name,
        status: v.status,
        avatar: v.avatar,
        phoneNumber: v.phoneNumber,
        birthDay: v.birthDay,
      })
    );
  }

  public async getSuggestByContact(
    request: ISuggestFriendRequest,
    transactionId: string | number
  ): Promise<IFriendResponse[]> {
    const userId: number = request.headers.token.userData.id;
    const queryBuilder: SelectQueryBuilder<any> = this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('friend', 'friend', 'user.id = friend.sourceId or user.id = friend.targetId')
      .where(
        new Brackets((qb) => {
          qb.where('user.name like :search', { search: `%${request.search}%` })
            .orWhere('user.email like :search', { search: `%${request.search}%` })
            .orWhere('user.phoneNumber like :search', { search: `%${request.search}%` });
        })
      )
      .andWhere(
        new Brackets((qb) => {
          qb.where('friend.sourceId != :userId', { userId }).andWhere('friend.targetId != :userId', { userId });
        })
      );
    if (request.phone != null) {
      queryBuilder.andWhere({ phoneNumber: In(request.phone) });
    }
    const users: User[] = await queryBuilder.getMany();
    return users.map(
      (user: User): IFriendResponse => ({
        id: user.id,
        name: user.name,
        avatar: user.avatar,
        status: user.status,
        phoneNumber: user.phoneNumber,
        birthDay: user.birthDay,
      })
    );
  }

  public async blockFriend(request: IFriendRequest, transactionId: string | number) {
    const userId: number = request.headers.token.userData.id;
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.friend, 'friend').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    try {
      while (
        (await this.cacheService.findInprogessValidate(request.friend, Constants.DISABLE_INPROGESS, transactionId)) ||
        (await this.cacheService.findInprogessValidate(request.friend, Constants.BLOCK_INPROGESS, transactionId))
      ) {
        Logger.warn(`${transactionId} waiting do progess`);
      }
      this.cacheService.addInprogessValidate(request.friend, Constants.BLOCK_INPROGESS, transactionId);
      const user: User = await this.userRepository.findOne({
        id: request.friend as number,
        status: UserStatus.ACTIVE,
      });
      if (user == null) {
        throw new Errors.GeneralError(Constants.USER_NOT_FOUND);
      }
      const friends: number = await this.friendRepository
        .createQueryBuilder('friend')
        .where("CONCAT(friend.sourceId, '_', friend.targetId) in (:concatid)", {
          concatid: [`${userId}_${user.id}`, `${user.id}_${userId}`],
        })
        .getCount();
      if (friends > 0) {
        await this.friendRepository
          .createQueryBuilder('friend')
          .update({
            status: FriendStatus.BLOCKED,
          })
          .where("CONCAT(friend.sourceId, '_', friend.targetId) in (:concatid)", {
            concatid: [`${userId}_${user.id}`, `${user.id}_${userId}`],
          })
          .execute();
      } else {
        const friend: Friend = new Friend();
        friend.sourceId = userId;
        friend.targetId = user.id;
        friend.status = FriendStatus.BLOCKED;
        await this.friendRepository.save(friend);
      }
      getInstance().sendMessage(`${transactionId}`, 'core', 'delete:/api/v1/chat/conversation/{roomId}', {
        recipientId: request.friend,
      });
    } catch (error) {
      Logger.error(`${transactionId} Error:`, error);
      if (error instanceof Errors.GeneralError) {
        throw error;
      }
      throw new Errors.GeneralError();
    } finally {
      this.cacheService.removeInprogessValidate(request.friend, Constants.BLOCK_INPROGESS, transactionId);
    }
    return {};
  }

  public async unblockFriend(request: IFriendRequest, transactionId: string | number) {
    const userId: number = request.headers.token.userData.id;
    const friend: Friend = await this.friendRepository.findOne({
      id: request.friend as number,
      sourceId: userId,
      status: FriendStatus.BLOCKED,
    });
    if (friend == null) {
      throw new Errors.GeneralError(Constants.OBJECT_NOT_FOUND);
    }
    await this.manager.transaction(async (transactionalEntityManager) => {
      await transactionalEntityManager.delete(Friend, friend.id);
    });
    return {};
  }

  public async checkFriend(request: any, transactionId: string | number) {
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.friend, 'friend').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    const userId: number = request.headers.token.userData.id;
    const friend: Friend = await this.friendRepository.findOne({
      sourceId: userId,
      targetId: request.friend as number,
      status: FriendStatus.FRIENDED,
    });
    return { isFriend: friend != null };
  }

  public async deleteAllFriend(userId: number) {
    await this.friendRepository
      .createQueryBuilder('friend')
      .delete()
      .where('sourceId = :userId or targetId = :userId', { userId: userId })
      .execute();
  }

  public async internalListFriends(request: IDataRequest, transactionId: string | number) {
    const userId: number = request.headers.token.userData.id;
    const result: any[] = await this.friendRepository
      .createQueryBuilder('friend')
      .innerJoinAndSelect('user', 'user', 'user.id = friend.sourceId or user.id = friend.targetId')
      .andWhere(
        new Brackets((qb) => {
          qb.where('friend.targetId = :userId', { userId }).orWhere('friend.sourceId = :userId', { userId });
        })
      )
      .andWhere('user.id != :userId', { userId })
      .andWhere('friend.status = :status', { status: FriendStatus.FRIENDED })
      .getMany();
    return result.map(
      (user: User): IFriendResponse => ({
        id: user.id,
        name: user.name,
        avatar: user.avatar,
        status: user.status,
        phoneNumber: user.phoneNumber,
        birthDay: user.birthDay,
      })
    );
  }

  private async findFriendBy(userId: number, status: FriendStatus, offset: number = 0, limit: number = 20) {
    return await this.friendRepository
      .createQueryBuilder('friend')
      .innerJoinAndSelect('user', 'user', 'user.id = friend.sourceId or user.id = friend.targetId')
      .andWhere(
        new Brackets((qb) => {
          qb.where('friend.targetId = :userId', { userId }).orWhere('friend.sourceId = :userId', { userId });
        })
      )
      .andWhere('user.id != :userId', { userId })
      .andWhere('friend.status = :status', { status })
      .skip(offset)
      .take(limit)
      .getMany();
  }
}
