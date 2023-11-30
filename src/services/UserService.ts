import { Inject, Service } from 'typedi';
import CacheService from './CacheService';
import TokenService from './TokenService';
import { IUserInfoRequest } from '../models/request/IUserInfoRequest';
import { Errors, Logger, Models, Utils } from 'common';
import User from '../models/entities/User';
import { Brackets, In, Repository } from 'typeorm';
import IUserInfoResponse from '../models/response/IUserInfoResponse';
import { IUpdateUserInfoRequest } from '../models/request/IUpdateUserInfoRequest';
import IResultResponse from '../models/response/IResultResponse';
import Constants from '../Constants';
import * as utils from '../utils/Utils';
import config from '../Config';
import IDisableUserRequest from '../models/request/IDisableUserRequest';
import IDeleteUserResponse from '../models/response/IDeleteUserResponse';
import * as bcrypt from 'bcrypt';
import IUserConfirmRequest from '../models/request/IUserConfirmRequest';
import { UserStatus } from '../models/enum/UserStatus';
import { InjectRepository } from 'typeorm-typedi-extensions';
import { getInstance } from './KafkaProducerService';
import { ISearchUserRequest } from '../models/request/ISearchUser';
import { ObjectMapper } from 'jackson-js';
import Config from '../Config';
import { FriendStatus } from '../models/enum/FriendStatus';
import Friend from '../models/entities/Friend';

@Service()
export default class UserService {
  @Inject()
  private cacheService: CacheService;
  @Inject()
  private tokenService: TokenService;
  @InjectRepository(User)
  private userRepository: Repository<User>;
  @InjectRepository(Friend)
  private friendRepository: Repository<Friend>;
  private FULLNAME_REGEX = new RegExp(
    '[a-zA-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠàáâãèéêìíòóôõùúăđĩũơƯĂẠẢẤẦẨẪẬẮẰẲẴẶẸẺẼỀỀỂẾưăạảấầẩẫậắằẳẵặẹẻẽềềểếỄỆỈỊỌỎỐỒỔỖỘỚỜỞỠỢỤỦỨỪễệỉịọỏốồổỗộớờởỡợụủứừỬỮỰỲỴÝỶỸ]+'
  );

  public async getUserInfo(request: IUserInfoRequest, transactionId: string | number) {
    const userId = request.userId ? request.userId : request.headers.token.userData.id;
    const user: User = await this.userRepository.findOne({ id: userId });
    const response: IUserInfoResponse = {
      name: user.name,
      status: user.status,
      email: user.email,
      phoneNumber: user.phoneNumber,
      about: user.about,
      avatar: user.avatar,
      id: user.id,
      privateMode: user.privateMode,
    };
    return response;
  }

  public async putUserInfo(request: IUpdateUserInfoRequest, transactionId: string | number) {
    const userId: number = request.headers.token.userData.id;
    try {
      while (await this.cacheService.findInprogessValidate(userId, Constants.UPDATE_INPROGESS, transactionId)) {
        Logger.warn(`${transactionId} waiting do progess`);
      }
      this.cacheService.addInprogessValidate(userId, Constants.UPDATE_INPROGESS, transactionId);
      if (!this.FULLNAME_REGEX.test(request.name)) {
        throw new Errors.GeneralError(Constants.NAME_NOT_MATCHED_POLICY);
      }
      const user: User = await this.userRepository.findOne({ id: userId });
      if (user == null) {
        throw new Errors.GeneralError(Constants.OBJECT_NOT_FOUND);
      }
      await this.userRepository.update(
        { id: userId },
        {
          name: request.name,
          about: request.about,
          avatar: request.avatar,
        }
      );
    } catch (error) {
      if (error instanceof Errors.GeneralError) {
        throw error;
      }
      throw new Errors.GeneralError();
    } finally {
      this.cacheService.removeInprogessValidate(userId, Constants.UPDATE_INPROGESS, transactionId);
    }
    const response: IResultResponse = {
      status: Constants.UPDATE_USER_INFO_SUCCESSFULL,
    };
    return response;
  }

  public async updateMode(request: IUpdateUserInfoRequest, transactionId: string | number) {
    const userId: number = request.headers.token.userData.id;
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.mode, 'mode').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    try {
      while (await this.cacheService.findInprogessValidate(userId, Constants.UPDATE_INPROGESS, transactionId)) {
        Logger.warn(`${transactionId} waiting do progess`);
      }
      this.cacheService.addInprogessValidate(userId, Constants.UPDATE_INPROGESS, transactionId);
      const user: User = await this.userRepository.findOne({ id: userId });
      if (user == null) {
        throw new Errors.GeneralError(Constants.OBJECT_NOT_FOUND);
      }
      await this.userRepository.update(
        { id: userId },
        {
          privateMode: request.mode,
        }
      );
    } catch (error) {
      if (error instanceof Errors.GeneralError) {
        throw error;
      }
      throw new Errors.GeneralError();
    } finally {
      this.cacheService.removeInprogessValidate(userId, Constants.UPDATE_INPROGESS, transactionId);
    }
    const response: IResultResponse = {
      status: Constants.UPDATE_USER_INFO_SUCCESSFULL,
    };
    return response;
  }

  public async confirmUser(request: IUserConfirmRequest, transactionId: string | number) {
    const userId: number = request.headers.token.userData.id;
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.password, 'password').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    try {
      while (
        (await this.cacheService.findInprogessValidate(userId, Constants.CHANGE_PASSWORD_INPROGESS, transactionId)) ||
        (await this.cacheService.findInprogessValidate(userId, Constants.DISABLE_INPROGESS, transactionId))
      ) {
        Logger.warn(`${transactionId} waiting do progess`);
      }
      const user: User = await this.userRepository.findOne({
        where: {
          id: userId,
          status: UserStatus.ACTIVE,
        },
      });
      if (user == null) {
        throw new Errors.GeneralError(Constants.USER_NOT_FOUND);
      }
      let password: string = config.app.encryptPassword
        ? await utils.rsaDecrypt(request.password, config.key.rsa.privateKey)
        : request.password;
      let response: IDeleteUserResponse = {
        value: await this.comparePassword(password, user.password),
      };
      return response;
    } catch (error) {
      Logger.error(`${transactionId} Error:`, error);
      if (error instanceof Errors.GeneralError) {
        throw error;
      }
      throw new Errors.GeneralError();
    }
  }

  public async disableUser(request: IDisableUserRequest, transactionId: string | number) {
    const userId: number = request.headers.token.userData.id;
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.hash, 'hash').setRequire().throwValid(invalidParams);
    Utils.validate(request.otpKey, 'otpKey').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    utils.validHash(request.hash, 'DELETE_USER');
    const clams = await this.tokenService.validateOtpKey(request.otpKey, transactionId);
    try {
      while (await this.cacheService.findInprogessValidate(userId, Constants.DISABLE_INPROGESS, transactionId)) {
        Logger.warn(`${transactionId} waiting do progess`);
      }
      this.cacheService.addInprogessValidate(userId, Constants.DISABLE_INPROGESS, transactionId);
      const user: User = await this.userRepository.findOne({
        id: userId,
        status: UserStatus.ACTIVE,
      });
      if (user == null) {
        throw new Errors.GeneralError(Constants.USER_NOT_FOUND);
      }
      await this.userRepository.update(
        { id: userId },
        {
          status: UserStatus.INACTIVE,
          deletedAt: new Date(),
        }
      );
      this.cacheService.removeOtpKey(clams.id, transactionId);
      this.sendMessageDeleteAccount(user, transactionId);
    } catch (error) {
      Logger.error(`${transactionId} Error:`, error);
      if (error instanceof Errors.GeneralError) {
        throw error;
      }
      throw new Errors.GeneralError();
    } finally {
      this.cacheService.removeInprogessValidate(userId, Constants.DISABLE_INPROGESS, transactionId);
    }
    return {};
  }

  public async getUserInfos(request: any, transactionId: string | number): Promise<IUserInfoResponse[]> {
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.userIds, 'userIds').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    const results: User[] = await this.userRepository
      .createQueryBuilder('user')
      .where({ id: In(request.userIds), status: UserStatus.ACTIVE })
      .getMany();
    return results.map(
      (v: User, i: number): IUserInfoResponse => ({
        name: v.name,
        status: v.status,
        email: v.email,
        phoneNumber: v.phoneNumber,
        about: v.about,
        avatar: v.avatar,
        id: v.id,
        privateMode: v.privateMode,
      })
    );
  }

  public async searchUser(request: ISearchUserRequest, transactionId: string | number): Promise<IUserInfoResponse[]> {
    const userId: number = request.headers.token.userData.id;
    const users: User[] = await this.userRepository
      .createQueryBuilder('user')
      .innerJoinAndSelect('friend', 'friend', 'user.id = friend.sourceId or user.id = friend.targetId')
      .where(
        new Brackets((qb) => {
          qb.where('user.name like :search', { search: `%${request.search}%` });
        })
      )
      .andWhere(
        new Brackets((qb) => {
          qb.where('friend.targetId = :userId', { userId }).orWhere('friend.sourceId = :userId', { userId });
        })
      )
      .andWhere('friend.status = :status', { status: FriendStatus.FRIENDED })
      .andWhere('user.id != :userId', { userId })
      .getMany();

    return users.map(
      (user: User): IUserInfoResponse => ({
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        status: user.status,
        phoneNumber: user.phoneNumber,
        about: user.about,
        privateMode: user.privateMode,
      })
    );
  }

  public async internalDeleteUser(request: any, transactionId: string | number) {
    await this.friendRepository
      .createQueryBuilder('friend')
      .delete()
      .where({ sourceId: request.userId })
      .orWhere({ targetId: request.userId })
      .execute();
    await this.userRepository.createQueryBuilder('user').delete().where({ id: request.userId }).execute();
    getInstance().sendMessage(`${transactionId}`, 'core', 'internal:/api/v1/deleteAll', {
      userIds: request.userId,
    });
    return {};
  }

  private async comparePassword(plaintextPassword: string | Buffer, hash: string): Promise<boolean> {
    return await bcrypt.compare(plaintextPassword, hash);
  }

  private sendMessageDeleteAccount(user, transactionId: string | number) {
    const objectMapper: ObjectMapper = new ObjectMapper();
    let notificationMessage: Models.NotificationMessage = new Models.NotificationMessage();
    notificationMessage.setLocale('en');
    notificationMessage.setMethod(Models.MethodEnum.EMAIL);
    const emailConfiguration: Models.EmailConfiguration = new Models.EmailConfiguration();
    emailConfiguration.setToList([user.email]);
    emailConfiguration.setSubject('DELETING FOTEI ACCOUNT');
    notificationMessage.setConfiguration(emailConfiguration, objectMapper);
    const value = {
      name: user.name,
    };
    const key: string = Config.app.template.deleteAccount;
    const template = {};
    template[key] = value;
    notificationMessage.setTemplate(template);
    getInstance().sendMessage(transactionId.toString(), Config.topic.notification, '', notificationMessage);
  }
}
