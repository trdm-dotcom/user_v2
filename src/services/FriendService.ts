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
      if (friends && friends.length > 0) {
        throw new Errors.GeneralError(Constants.ALREADY_EXISTS);
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
    const friend: Friend = await this.friendRepository.findOneBy({
      id: request.friend as number,
      status: FriendStatus.PENDING,
    });
    if (friend == null) {
      throw new Errors.GeneralError(Constants.OBJECT_NOT_FOUND);
    }
    friend.status = FriendStatus.FRIENDED;
    await AppDataSource.manager.transaction(async (transactionalEntityManager) => {
      await transactionalEntityManager.save(friend);
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
    const friend: Friend = await this.friendRepository.findOneBy({ id: request.friend as number });
    if (friend == null) {
      throw new Errors.GeneralError(Constants.OBJECT_NOT_FOUND);
    }
    await AppDataSource.manager.transaction(async (transactionalEntityManager) => {
      await transactionalEntityManager.delete(Friend, friend.id);
    });
    return {};
  }

  public async getRequestFriend(request: IDataRequest, transactionId: string | number) {
    const userId: number = request.headers.token.userData.id;
    const result: any[] = await this.findFriendByTargetId(userId, FriendStatus.PENDING);
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
    const result: any[] = await this.findFriendByTargetId(userId, FriendStatus.FRIENDED);
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

  private async findFriendByTargetId(userId: number, status: FriendStatus) {
    return await this.friendRepository
      .createQueryBuilder('friend')
      .innerJoinAndSelect('user', 'user', 'user.id = friend.sourceId')
      .where('friend.targetId = :userId and friend.status = :status ', { userId: userId, status: status })
      .getMany();
  }
}
