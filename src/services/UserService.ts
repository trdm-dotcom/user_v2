import { Inject, Service } from 'typedi';
import CacheService from './CacheService';
import TokenService from './TokenService';
import { IUserInfoRequest } from '../models/request/IUserInfoRequest';
import { Errors, Logger, Utils } from 'common';
import User from '../models/entities/User';
import { Repository } from 'typeorm';
import IUserInfoResponse from '../models/response/IUserInfoResponse';
import { IUpdateUserInfoRequest } from '../models/request/IUpdateUserInfoRequest';
import IResultResponse from '../models/response/IResultResponse';
import Constants from '../Constants';
import * as moment from 'moment';
import * as utils from '../utils/Utils';
import config from '../Config';
import IDisableUserRequest from '../models/request/IDisableUserRequest';
import IDeleteUserResponse from '../models/response/IDeleteUserResponse';
import * as bcrypt from 'bcrypt';
import IUserConfirmRequest from '../models/request/IUserConfirmRequest';
import { UserStatus } from '../models/enum/UserStatus';
import { v4 as uuid } from 'uuid';
import { InjectRepository } from 'typeorm-typedi-extensions';
import { getInstance } from './KafkaProducerService';
import FriendService from './FriendService';

@Service()
export default class UserService {
  @Inject()
  private cacheService: CacheService;
  @Inject()
  private tokenService: TokenService;
  @Inject()
  private friendService: FriendService;
  @InjectRepository(User)
  private userRepository: Repository<User>;
  private FULLNAME_REGEX = new RegExp(
    '^(?<!\\.)[a-zA-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠàáâãèéêìíòóôõùúăđĩũơƯĂẠẢẤẦẨẪẬẮẰẲẴẶẸẺẼỀỀỂẾưăạảấầẩẫậắằẳẵặẹẻẽềềểếỄỆỈỊỌỎỐỒỔỖỘỚỜỞỠỢỤỦỨỪễệỉịọỏốồổỗộớờởỡợụủứừỬỮỰỲỴÝỶỸửữựỳỵỷỹs]*$(?<!\\.)'
  );

  public async getUserInfo(request: IUserInfoRequest, transactionId: string | number) {
    const userId = request.headers.token.userData.id;
    const user: User = await this.userRepository.findOne({ id: userId });
    const response: IUserInfoResponse = {
      name: user.name,
      status: user.status,
      email: user.email,
      phoneNumber: user.phoneNumber,
      birthDay: user.birthDay,
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
          birthDay: moment(request.birthDay, 'YYYY-MM-DD').toDate(),
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
          phoneNumber: uuid(),
          email: uuid(),
        }
      );
      await this.friendService.deleteAllFriend(userId);
      getInstance().sendMessage(`${transactionId}`, 'core', 'internal:/api/v1/conversation/deleteAll', {
        headers: request.headers,
      });
      this.cacheService.removeOtpKey(clams.id, transactionId);
      this.sendMessageDeleteAccount(user);
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

  public async getUserInfos(request: any, transactionId: string | number) {
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.userIds, 'userIds').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    const results: User[] = await this.userRepository
      .createQueryBuilder('user')
      .where('user.id in (:userIds)', { userIds: request.userIds })
      .getMany();
    return results.map((v: User, i: number) => ({
      id: v.id,
      name: v.name,
      avatar: v.avatar,
    }));
  }

  private async comparePassword(plaintextPassword: string | Buffer, hash: string): Promise<boolean> {
    return await bcrypt.compare(plaintextPassword, hash);
  }

  private sendMessageDeleteAccount(user) {}
}
