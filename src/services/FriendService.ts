import { Service } from 'typedi';
import Friend from '../models/entities/Friend';
import { Repository } from 'typeorm';
import User from '../models/entities/User';
import { AppDataSource } from '../Connection';
import IFriendRequest from '../models/request/IFriendRequest';
import { Errors, Logger, Utils } from 'common';
import * as utils from '../utils/Utils';
import Constants from '../Constants';
import { UserStatus } from '../models/enum/UserStatus';
import { FriendStatus } from '../models/enum/FriendStatus';
import { FirebaseType, IDataRequest } from 'common/build/src/modules/models';
import IFriendResponse from '../models/response/IFriendResponse';
import { ISuggestFriendRequest } from '../models/request/ISuggestFriendRequest';

@Service()
export default class FriendService {
  private userRepository: Repository<User> = AppDataSource.getRepository(User);
  private friendRepository: Repository<Friend> = AppDataSource.getRepository(Friend);

  public async requestFriend(request: IFriendRequest, transactionId: string | number) {
    const userId: number = request.headers.token.userData.id;
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.friend, 'friend').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    try {
      const user: User = await this.userRepository.findOneBy({
        username: request.friend as string,
        status: UserStatus.ACTIVE,
      });
      if (user == null) {
        throw new Errors.GeneralError(Constants.USER_NOT_FOUND);
      }
      if (user.username == request.headers.token.userData.username) {
        throw new Errors.GeneralError(Constants.INVALID_USER);
      }
      const friends: Friend[] = await this.friendRepository
        .createQueryBuilder('friend')
        .where("CONCAT(friend.sourceId, '_', friend.targetId) in (:concatid)", {
          concatid: [`${userId}_${user.id}`, `${user.id}_${userId}`],
        })
        .getMany();
      if (friends) {
        if (friends.map((v) => v.status).includes(FriendStatus.BLOCKED)) {
          throw new Errors.GeneralError(Constants.WAS_BLOCKED);
        }
        if (friends.length > 0) {
          throw new Errors.GeneralError(Constants.ALREADY_EXISTS);
        }
      }
      const friend: Friend = new Friend();
      friend.sourceId = userId;
      friend.targetId = user.id;
      friend.status = FriendStatus.PENDING;
      await AppDataSource.manager.transaction(async (transactionalEntityManager) => {
        await transactionalEntityManager.save(friend);
      });
      utils.sendMessagePushNotification(
        transactionId.toString(),
        friend.targetId,
        'request friend',
        `${request.headers.token.userData} sent you a friend request`,
        'push_up',
        true,
        FirebaseType.CONDITION,
        `${friend.targetId}`
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
    const friend: Friend = await this.friendRepository.findOneBy({
      id: request.friend as number,
      targetId: userId,
      status: FriendStatus.PENDING,
    });
    if (friend == null) {
      throw new Errors.GeneralError(Constants.OBJECT_NOT_FOUND);
    }
    friend.status = FriendStatus.FRIENDED;
    await AppDataSource.manager.transaction(async (transactionalEntityManager) => {
      await Promise.all([transactionalEntityManager.save(friend)]);
    });
    utils.sendMessagePushNotification(
      transactionId.toString(),
      friend.sourceId,
      'accepted request',
      `${request.headers.token.userData.id} accepted your friend request`,
      'push_up',
      true,
      FirebaseType.CONDITION,
      `${friend.sourceId}`
    );
    return {};
  }

  public async rejectFriend(request: IFriendRequest, transactionId: string | number) {
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.friend, 'friend').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    const userId: number = request.headers.token.userData.id;
    const friend: Friend[] = await this.friendRepository
      .createQueryBuilder('friend')
      .where('id = :id and (sourceId = :=userId or targetId = :userId) and status != BLOCKED', {
        id: request.friend as number,
        userId: userId,
      })
      .getMany();
    if (friend == null) {
      throw new Errors.GeneralError(Constants.OBJECT_NOT_FOUND);
    }
    await AppDataSource.manager.transaction(async (transactionalEntityManager) => {
      const listPromise: Promise<any>[] = friend
        .map((friend) => [transactionalEntityManager.delete(Friend, friend.id)])
        .reduce((a, b) => a.concat(b), []);
      await Promise.all(listPromise);
    });
    return {};
  }

  public async getRequestFriend(request: IDataRequest, transactionId: string | number) {
    const userId: number = request.headers.token.userData.id;
    const result: any[] = await this.findFriendBy(userId, FriendStatus.PENDING);
    return result.map((v: any, i: number) => {
      let item: IFriendResponse = {
        friend: v.id,
        name: v.name,
        status: v.status,
        avatar: v.avatar,
      };
      return item;
    });
  }

  public async getFriend(request: IDataRequest, transactionId: string | number) {
    const userId: number = request.headers.token.userData.id;
    const result: any[] = await this.findFriendBy(userId, FriendStatus.FRIENDED);
    return result.map((v: any, i: number) => {
      let item: IFriendResponse = {
        friend: v.id,
        name: v.name,
        status: v.status,
        avatar: v.avatar,
      };
      return item;
    });
  }

  public async getSuggestByContact(request: ISuggestFriendRequest, transactionId: string | number) {
    const userId: number = request.headers.token.userData.id;
    const users: any[] = await this.userRepository
      .createQueryBuilder('user')
      .innerJoinAndSelect('friend', 'friend', 'user.id = friend.sourceId or user.id = friend.targetId')
      .where('user.username IN (:phone) and user.id != :userId', { phone: request.phone, userId: userId })
      .getMany();
    let map: Map<string, any> = new Map<string, any>();
    users.forEach((v: any, i: number) => {
      map.set(v.username, { id: v.id, name: v.name, avatar: v.avatar, status: v.status });
    });
    return request.phone.map((v: any, i: number) => map.get(v));
  }

  public async blockFriend(request: IFriendRequest, transactionId: string | number) {
    const userId: number = request.headers.token.userData.id;
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.friend, 'friend').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    const user: User = await this.userRepository.findOneBy({
      username: request.friend as string,
      status: UserStatus.ACTIVE,
    });
    if (user == null) {
      throw new Errors.GeneralError(Constants.USER_NOT_FOUND);
    }
    if (user.username == request.headers.token.userData.username) {
      throw new Errors.GeneralError(Constants.INVALID_USER);
    }
    await AppDataSource.manager.transaction(async (transactionalEntityManager) => {
      const friends: Friend[] = await this.friendRepository
        .createQueryBuilder('friend')
        .where("CONCAT(friend.sourceId, '_', friend.targetId) in (:concatid)", {
          concatid: [`${userId}_${user.id}`, `${user.id}_${userId}`],
        })
        .getMany();
      let listPromise: Promise<any>[] = [];
      if (friends) {
        listPromise = friends.map((friend) => {
          friend.status = FriendStatus.BLOCKED;
          return transactionalEntityManager.save(friend);
        });
      } else {
        const friend: Friend = new Friend();
        friend.sourceId = userId;
        friend.targetId = user.id;
        friend.status = FriendStatus.BLOCKED;
        listPromise.push(transactionalEntityManager.save(friend));
      }
      await Promise.all([...listPromise]);
    });
  }

  public async unblockFriend(request: IFriendRequest, transactionId: string | number) {
    const userId: number = request.headers.token.userData.id;
    const friend: Friend = await this.friendRepository.findOneBy({
      id: request.friend as number,
      sourceId: userId,
      status: FriendStatus.BLOCKED,
    });
    if (friend == null) {
      throw new Errors.GeneralError(Constants.OBJECT_NOT_FOUND);
    }
    await AppDataSource.manager.transaction(async (transactionalEntityManager) => {
      await transactionalEntityManager.delete(Friend, friend.id);
    });
    return {};
  }

  private async findFriendBy(userId: number, status: FriendStatus) {
    return await this.friendRepository
      .createQueryBuilder('friend')
      .innerJoinAndSelect('user', 'user', 'user.id = friend.sourceId or user.id = friend.targetId')
      .where(
        '(friend.targetId = :userId or friend.sourceId = :userId) and user.id != :userId and friend.status = :status',
        {
          userId: userId,
          status: status,
        }
      )
      .getMany();
  }
}
