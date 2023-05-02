import { Inject, Service } from 'typedi';
import CacheService from './CacheService';
import TokenService from './TokenService';
import { IUserInfoRequest } from '../models/request/IUserInfoRequest';
import { Errors, Logger, Utils } from 'common';
import { AppDataSource } from '../Connection';
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
import { randomBytes } from 'crypto';
import IUserRequest from '../models/request/IUserRequest';

@Service()
export default class UserService {
  @Inject()
  private cacheService: CacheService;
  @Inject()
  private tokenService: TokenService;
  private userRepository: Repository<User> = AppDataSource.getRepository(User);

  public async getUserInfo(request: IUserInfoRequest, transactionId: string | number) {
    const userId = request.headers.token.userData.id;
    const user: User = await this.userRepository.findOneBy({ id: userId });
    const response: IUserInfoResponse = {
      name: user.name,
      username: user.username,
      isVerified: user.verified,
      status: user.status,
      deviceToken: user.deviceToken,
      phoneNumber: user.phoneNumber,
    };
    return response;
  }

  public async putUserInfo(request: IUpdateUserInfoRequest, transactionId: string | number) {
    const userId: number = request.headers.token.userData.id;
    const username: string = request.headers.token.userData.username;
    try {
      while (await this.cacheService.findInprogessValidate(username, Constants.UPDATE_INPROGESS)) {
        Logger.warn(`${transactionId} waiting do progess`);
      }
      this.cacheService.addInprogessValidate(username, Constants.UPDATE_INPROGESS);
      const user: User = await this.userRepository.findOneBy({ id: userId });
      if (user == null) {
        throw new Error(Constants.OBJECT_NOT_FOUND);
      }
      user.name = request.name;
      user.birthDay = moment(request.birthDay, 'YYYY-MM-DD').toDate();
      AppDataSource.manager.transaction(async (transactionalEntityManager) => {
        await transactionalEntityManager.save(user);
      });
    } catch (err) {
      throw new Errors.GeneralError(err.message);
    } finally {
      this.cacheService.removeInprogessValidate(username, Constants.UPDATE_INPROGESS);
    }
    const response: IResultResponse = {
      status: Constants.UPDATE_USER_INFO_SUCCESSFULL,
    };
    return response;
  }

  public async confirmUser(request: IUserConfirmRequest, transactionId: string | number) {
    const userId: number = request.headers.token.userData.id;
    const username: string = request.headers.token.userData.username;
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.password, 'password').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    try {
      while (
        (await this.cacheService.findInprogessValidate(username, Constants.UPDATE_INPROGESS)) ||
        (await this.cacheService.findInprogessValidate(username, Constants.DISABLE_INPROGESS))
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
    } catch (err) {
      throw new Errors.GeneralError(err.message);
    }
  }

  public async disableUser(request: IDisableUserRequest, transactionId: string | number) {
    const userId: number = request.headers.token.userData.id;
    const username: string = request.headers.token.userData.username;
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.hash, 'hash').setRequire().throwValid(invalidParams);
    Utils.validate(request.otpKey, 'otpKey').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    utils.validHash(request.hash, 'DELETE_USER');
    const clams = await this.tokenService.validateOtpKey(request.otpKey);
    try {
      while (await this.cacheService.findInprogessValidate(username, Constants.DISABLE_INPROGESS)) {
        Logger.warn(`${transactionId} waiting do progess`);
      }
      this.cacheService.addInprogessValidate(username, Constants.DISABLE_INPROGESS);
      const user: User = await this.userRepository.findOne({
        where: {
          id: userId,
          status: UserStatus.ACTIVE,
        },
      });
      if (user == null) {
        throw new Error(Constants.USER_NOT_FOUND);
      }
      user.username = randomBytes(20).toString('utf-8');
      user.status = UserStatus.INACTIVE;
      AppDataSource.manager.transaction(async (transactionalEntityManager) => {
        await transactionalEntityManager.save(user);
      });
      this.cacheService.removeOtpKey(clams.id);
      this.sendMessageDeleteAccount(username);
    } catch (error) {
      throw new Errors.GeneralError(error.message);
    } finally {
      this.cacheService.removeInprogessValidate(username, Constants.DISABLE_INPROGESS);
    }
    return {};
  }

  public async searchUser(request: IUserRequest, transactionId: string | number) {
    const result: User[] = await this.userRepository
      .createQueryBuilder('user')
      .where('username like :username or name like :name', {
        username: `%${request.search}%`,
        name: `%${request.search}%`,
      })
      .getMany();
    return result.map((v: any, i: number) => {
      const item: IUserInfoResponse = {
        name: v.name,
        username: v.username,
        avatar: v.avatar,
      };
      return item;
    });
  }

  private async comparePassword(plaintextPassword: string | Buffer, hash: string): Promise<boolean> {
    return await bcrypt.compare(plaintextPassword, hash);
  }

  private sendMessageDeleteAccount(username: string) {}
}
