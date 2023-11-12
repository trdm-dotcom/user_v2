import { Inject, Service } from 'typedi';
import Friend from '../models/entities/Friend';
import { Brackets, In, Repository, SelectQueryBuilder } from 'typeorm';
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
import { InjectRepository } from 'typeorm-typedi-extensions';
import CacheService from './CacheService';
import { getInstance } from './KafkaProducerService';
import IUserInfoResponse from '../models/response/IUserInfoResponse';

@Service()
export default class FriendService {
  @Inject()
  private cacheService: CacheService;
  @InjectRepository(User)
  private userRepository: Repository<User>;
  @InjectRepository(Friend)
  private friendRepository: Repository<Friend>;

  public async requestFriend(request: IFriendRequest, transactionId: string | number) {
    const userId: number = request.headers.token.userData.id;
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.friend, 'friend').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    const name: string = request.headers.token.userData.name;
    try {
      while (
        (await this.cacheService.findInprogessValidate(request.friend, Constants.DISABLE_INPROGESS, transactionId)) ||
        (await this.cacheService.findInprogessValidate(request.friend, Constants.BLOCK_INPROGESS, transactionId))
      ) {
        Logger.warn(`${transactionId} waiting do progess`);
      }
      const user: User = await this.userRepository.findOne({
        id: request.friend,
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
      const friendEntity: Friend = await this.friendRepository.save(friend);
      utils.sendMessagePushNotification(
        `${transactionId}`,
        friend.targetId,
        `${name} sent you a friend request`,
        'push_up',
        FirebaseType.TOKEN,
        true,
        null,
        'REQUEST',
        userId,
        userId
      );
      return {
        id: friendEntity.id,
        status: friendEntity.status,
      };
    } catch (error) {
      Logger.error(`${transactionId} Error:`, error);
      if (error instanceof Errors.GeneralError) {
        throw error;
      } else {
        throw new Errors.GeneralError();
      }
    }
  }

  public async acceptFriend(request: IFriendRequest, transactionId: string | number) {
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.friend, 'friend').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    const userId: number = request.headers.token.userData.id;
    const name: string = request.headers.token.userData.name;
    try {
      while (
        (await this.cacheService.findInprogessValidate(request.friend, Constants.DISABLE_INPROGESS, transactionId)) ||
        (await this.cacheService.findInprogessValidate(request.friend, Constants.BLOCK_INPROGESS, transactionId))
      ) {
        Logger.warn(`${transactionId} waiting do progess`);
      }
      const friend: Friend = await this.friendRepository.findOne({
        id: request.friend,
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
        `${transactionId}`,
        friend.sourceId,
        `${name} accepted your friend request`,
        'push_up',
        FirebaseType.TOKEN,
        true,
        null,
        'ACCEPT',
        userId,
        userId
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
    const friend: Friend = await this.friendRepository
      .createQueryBuilder('friend')
      .where('friend.id = :id and friend.status != :status', { id: request.friend, status: FriendStatus.BLOCKED })
      .getOne();
    if (friend == null) {
      throw new Errors.GeneralError(Constants.OBJECT_NOT_FOUND);
    }
    if (friend.sourceId != userId && friend.targetId != userId) {
      throw new Errors.GeneralError(Constants.USER_DONT_HAVE_PERMISSION);
    }
    const friendId = friend.sourceId == userId ? friend.targetId : friend.sourceId;
    this.friendRepository.delete({ id: request.friend });
    getInstance().sendMessage(`${transactionId}`, 'core', 'internal:/api/v1/chat/conversation/delete', {
      headers: request.headers,
      recipientId: friendId,
    });
    return {};
  }

  public async getRequestFriend(request: IFriendRequest, transactionId: string | number) {
    const userId: number = request.headers.token.userData.id;
    const limit = request.pageSize == null ? 20 : Math.min(Number(request.pageSize), 100);
    const offset = request.pageNumber == null ? 0 : Math.max(Number(request.pageNumber), 0) * limit;
    const { results, count } = await this.findFriendBy(userId, FriendStatus.PENDING, offset, limit);
    const datas = results.map(
      (v: any, i: number): IFriendResponse => ({
        id: v.friend_id,
        email: v.user_email,
        name: v.user_name,
        status: v.user_status,
        avatar: v.user_avatar,
        phoneNumber: v.user_phone_number,
        about: v.user_about,
        friendId: v.user_id,
        isAccept: userId == v.friend_targetId && v.friend_status == FriendStatus.PENDING,
        friendStatus: v.friend_status,
        privateMode: v.user_private_mode,
      })
    );
    return {
      total: count,
      datas: datas,
      page: Number(request.pageNumber),
      totalPages: Math.ceil(count / limit),
    };
  }

  public async getFriend(request: IFriendRequest, transactionId: string | number) {
    const userId: number = request.headers.token.userData.id;
    const limit = request.pageSize == null ? 20 : Math.min(Number(request.pageSize), 100);
    const offset = request.pageNumber == null ? 0 : Math.max(Number(request.pageNumber), 0) * limit;
    const { results, count } = await this.findFriendBy(userId, FriendStatus.FRIENDED, offset, limit);
    const datas = results.map(
      (v: any, i: number): IFriendResponse => ({
        id: v.friend_id,
        email: v.user_email,
        name: v.user_name,
        status: v.user_status,
        avatar: v.user_avatar,
        phoneNumber: v.user_phone_number,
        about: v.user_about,
        friendId: v.user_id,
        isAccept: userId == v.friend_targetId && v.friend_status == FriendStatus.PENDING,
        friendStatus: v.friend_status,
        privateMode: v.user_private_mode,
      })
    );
    return {
      total: count,
      datas: datas,
      page: Number(request.pageNumber),
      totalPages: Math.ceil(count / limit),
    };
  }

  public async getBlockFriend(request: IFriendRequest, transactionId: string | number) {
    const userId: number = request.headers.token.userData.id;
    const limit = request.pageSize == null ? 20 : Math.min(Number(request.pageSize), 100);
    const offset = request.pageNumber == null ? 0 : Math.max(Number(request.pageNumber), 0) * limit;
    const results: any[] = await this.friendRepository
      .createQueryBuilder('friend')
      .innerJoinAndSelect('user', 'user', 'user.id = friend.sourceId')
      .where('user.id = :userId and friend.status = :status and user.status = :accStatus', {
        userId: userId,
        status: FriendStatus.BLOCKED,
        accStatus: UserStatus.ACTIVE,
      })
      .offset(offset)
      .limit(limit)
      .getRawMany();
    const count: number = await this.friendRepository
      .createQueryBuilder('friend')
      .innerJoinAndSelect('user', 'user', 'user.id = friend.sourceId')
      .where('user.id = :userId and friend.status = :status and user.status = :accStatus', {
        userId: userId,
        status: FriendStatus.BLOCKED,
        accStatus: UserStatus.ACTIVE,
      })
      .getCount();
    const datas = results.map(
      (v: any, i: number): IFriendResponse => ({
        id: v.friend_id,
        email: v.user_email,
        name: v.user_name,
        status: v.user_status,
        avatar: v.user_avatar,
        phoneNumber: v.user_phone_number,
        about: v.user_about,
        friendId: v.user_id,
        isAccept: userId == v.friend_targetId && v.friend_status == FriendStatus.PENDING,
        friendStatus: v.friend_status,
        privateMode: v.user_private_mode,
      })
    );
    return {
      total: count,
      datas: datas,
      page: Number(request.pageNumber),
      totalPages: Math.ceil(count / limit),
    };
  }

  public async getSuggestByContact(request: ISuggestFriendRequest, transactionId: string | number) {
    const userId: number = request.headers.token.userData.id;
    const limit = request.pageSize == null ? 20 : Math.min(Number(request.pageSize), 100);
    const offset = request.pageNumber == null ? 0 : Math.max(Number(request.pageNumber), 0) * limit;
    const subQuery = this.friendRepository
      .createQueryBuilder('friend')
      .select('CASE WHEN friend.sourceId = :userId THEN friend.targetId ELSE friend.sourceId END', 'user_id')
      .addSelect('friend.status', 'friend_status')
      .distinct()
      .where('friend.sourceId = :userId OR friend.targetId = :userId', { userId })
      .getQuery();
    const queryBuilder: SelectQueryBuilder<any> = this.userRepository
      .createQueryBuilder('user')
      .leftJoin(`(${subQuery})`, 'user_friend', 'user.id = user_friend.user_id')
      .addSelect('user_friend.friend_status', 'friend_status')
      .where(
        new Brackets((qb) => {
          qb.where('user.id != :userId', { userId }).andWhere('user_friend.user_id IS NULL');
        })
      );
    if (request.search != null) {
      queryBuilder.andWhere(
        new Brackets((qb) => {
          qb.where('user.name like :search', { search: `%${request.search}%` })
            .orWhere('user.email like :search', { search: `%${request.search}%` })
            .orWhere('user.phoneNumber like :search', { search: `%${request.search}%` });
        })
      );
    }
    if (request.phone != null) {
      queryBuilder.andWhere({ phoneNumber: In(request.phone) });
    }
    const results: any[] = await queryBuilder.offset(offset).limit(limit).getRawMany();
    const count: number = await queryBuilder.getCount();
    const datas = results.map(
      (v: any, i: number): IFriendResponse => ({
        id: v.user_id,
        email: v.user_email,
        name: v.user_name,
        status: v.user_status,
        avatar: v.user_avatar,
        phoneNumber: v.user_phone_number,
        about: v.user_about,
        friendId: v.user_id,
        isAccept: false,
        friendStatus: v.friend_status,
        privateMode: v.user_private_mode,
      })
    );
    return {
      total: count,
      datas: datas,
      page: Number(request.pageNumber),
      totalPages: Math.ceil(count / limit),
    };
  }

  public async getFriendOfUser(request: IFriendRequest, transactionId: string | number) {
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.friend, 'friend').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    const userId: number = request.headers.token.userData.id;
    const friend: number = Number(request.friend);
    const limit = request.pageSize == null ? 20 : Math.min(Number(request.pageSize), 100);
    const offset = request.pageNumber == null ? 0 : Math.max(Number(request.pageNumber), 0) * limit;
    const subQuerySource = this.friendRepository
      .createQueryBuilder('friend')
      .select('IF(friend.sourceId = :friend, friend.targetId, friend.sourceId)', 'user_id')
      .distinct()
      .where('(friend.sourceId = :friend OR friend.targetId = :friend) AND friend.status = :status')
      .getQuery();

    const subQueryTarget = this.friendRepository
      .createQueryBuilder('friend')
      .select('IF(friend.sourceId = :userId, friend.targetId, friend.sourceId)', 'user_id')
      .addSelect('friend.status', 'friend_status')
      .distinct()
      .where(
        '(friend.sourceId = :userId OR friend.targetId = :userId) AND (friend.sourceId != :friend AND friend.targetId != :friend)'
      )
      .getQuery();

    const queryBuilder: SelectQueryBuilder<any> = this.userRepository
      .createQueryBuilder('user')
      .innerJoin(`(${subQuerySource})`, 'user_friend_source', 'user.id = user_friend_source.user_id', {
        userId,
        friend,
        status: FriendStatus.FRIENDED,
      })
      .leftJoin(
        `(${subQueryTarget})`,
        'user_friend_target',
        'user_friend_source.user_id = user_friend_target.user_id',
        { userId, friend }
      )
      .addSelect('user_friend_target.user_id IS NOT NULL', 'is_friend')
      .addSelect('user_friend_target.friend_status', 'friend_status')
      .where(
        'user_friend_target.friend_status != :blockStatus OR user_friend_target.friend_status IS NULL AND user.status = :accStatus',
        {
          blockStatus: FriendStatus.BLOCKED,
          accStatus: UserStatus.ACTIVE,
        }
      );

    const results: any[] = await queryBuilder.offset(offset).limit(limit).getRawMany();
    const count: number = await queryBuilder.getCount();
    const datas = results.map(
      (v: any, i: number): IFriendResponse => ({
        id: v.user_id,
        email: v.user_email,
        name: v.user_name,
        status: v.user_status,
        avatar: v.user_avatar,
        phoneNumber: v.user_phone_number,
        about: v.user_about,
        friendId: v.user_id,
        isAccept: v.is_friend,
        friendStatus: v.friend_status,
        privateMode: v.user_private_mode,
      })
    );
    return {
      total: count,
      datas: datas,
      page: Number(request.pageNumber),
      totalPages: Math.ceil(count / limit),
    };
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
        id: request.friend,
        status: UserStatus.ACTIVE,
      });
      if (user == null) {
        throw new Errors.GeneralError(Constants.USER_NOT_FOUND);
      }
      let friend: Friend = await this.friendRepository
        .createQueryBuilder('friend')
        .where("CONCAT(friend.sourceId, '_', friend.targetId) in (:concatid)", {
          concatid: [`${userId}_${user.id}`, `${user.id}_${userId}`],
        })
        .getOne();
      if (friend != null) {
        friend.status = FriendStatus.BLOCKED;
      } else {
        friend = new Friend();
        friend.sourceId = userId;
        friend.targetId = user.id;
        friend.status = FriendStatus.BLOCKED;
      }
      friend = await this.friendRepository.save(friend);
      getInstance().sendMessage(`${transactionId}`, 'core', 'internal:/api/v1/chat/conversation/delete', {
        recipientId: request.friend,
      });
      return {
        id: friend.id,
        status: friend.status,
      };
    } catch (error) {
      Logger.error(`${transactionId} Error:`, error);
      if (error instanceof Errors.GeneralError) {
        throw error;
      }
      throw new Errors.GeneralError();
    } finally {
      this.cacheService.removeInprogessValidate(request.friend, Constants.BLOCK_INPROGESS, transactionId);
    }
  }

  public async unblockFriend(request: IFriendRequest, transactionId: string | number) {
    const userId: number = request.headers.token.userData.id;
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.friend, 'friend').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    const friend: Friend = await this.friendRepository.findOne({
      id: request.friend,
      sourceId: userId,
      status: FriendStatus.BLOCKED,
    });
    if (friend == null) {
      throw new Errors.GeneralError(Constants.OBJECT_NOT_FOUND);
    }
    await this.friendRepository.delete(friend.id);
    return {};
  }

  public async checkFriend(request: IFriendRequest, transactionId: string | number) {
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.friend, 'friend').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    const userId: number = request.headers.token.userData.id;
    const friend: Friend = await this.friendRepository
      .createQueryBuilder('friend')
      .where("CONCAT(friend.sourceId, '_', friend.targetId) in (:concatid)", {
        concatid: [`${userId}_${request.friend}`, `${request.friend}_${userId}`],
      })
      .getOne();
    return {
      isFriend: friend != null,
      status: friend == null ? null : friend.status,
      friendId: friend == null ? null : friend.id,
      targetId: friend == null ? null : friend.targetId,
    };
  }

  private async findFriendBy(userId: number, status: FriendStatus, offset: number = 0, limit: number = 20) {
    const queryBuilder: SelectQueryBuilder<any> = this.friendRepository
      .createQueryBuilder('friend')
      .innerJoinAndSelect('user', 'user', 'user.id = friend.sourceId or user.id = friend.targetId')
      .where(
        new Brackets((qb) => {
          qb.where('friend.targetId = :userId', { userId }).orWhere('friend.sourceId = :userId', { userId });
        })
      )
      .andWhere('user.id != :userId', { userId })
      .andWhere('friend.status = :status', { status })
      .andWhere('user.status = :accStatus', { accStatus: UserStatus.ACTIVE });
    const results = await queryBuilder.offset(offset).limit(limit).getRawMany();
    const count = await queryBuilder.getCount();
    return {
      results,
      count,
    };
  }

  public async getFriendInternal(request: IDataRequest, transactionId: string | number) {
    const userId: number = request.headers.token.userData.id;
    const results: any = await this.userRepository
      .createQueryBuilder('user')
      .innerJoinAndSelect('friend', 'friend', 'user.id = friend.sourceId or user.id = friend.targetId')
      .distinct()
      .where(
        new Brackets((qb) => {
          qb.where('friend.targetId = :userId', { userId }).orWhere('friend.sourceId = :userId', { userId });
        })
      )
      .andWhere('friend.status = :status', { status: FriendStatus.FRIENDED })
      .andWhere('user.status = :accStatus', { accStatus: UserStatus.ACTIVE })
      .getMany();
    return results.map(
      (v: any, i: number): IUserInfoResponse => ({
        id: v.id,
        email: v.email,
        name: v.name,
        status: v.status,
        avatar: v.avatar,
        phoneNumber: v.phone_number,
        about: v.about,
        privateMode: v.privateMode,
      })
    );
  }
}
