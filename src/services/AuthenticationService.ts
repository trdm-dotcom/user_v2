import { Inject, Service } from 'typedi';
import CacheService from './CacheService';
import TokenService from './TokenService';
import { ILoginRequest } from '../models/request/ILoginRequest';
import { ILoginResponse } from '../models/response/ILoginResponse';
import { Errors, Logger, Utils } from 'common';
import * as moment from 'moment';
import config from '../Config';
import * as utils from '../utils/Utils';
import * as bcrypt from 'bcrypt';
import { UserStatus } from '../models/enum/UserStatus';
import Constants from '../Constants';
import ILoginValid from '../models/redis/ILoginValid';
import User from '../models/entities/User';
import { AppDataSource } from '../Connection';
import { Repository } from 'typeorm';
import { IRegisterRequest } from '../models/request/IRegisterRequest';
import IResultResponse from '../models/response/IResultResponse';
import IChangePasswordRequest from '../models/request/IChangePasswordRequest';
import IResetPasswordRequest from '../models/request/IResetPasswordRequest';
import ICheckExistRequest from '../models/request/ICheckExistRequest';
import ICheckExistResponse from '../models/response/ICheckExistResponse';

@Service()
export default class AuthenticationService {
  @Inject()
  private cacheService: CacheService;
  @Inject()
  private tokenService: TokenService;
  private PASSWORD_REGEX = new RegExp('^(?<!\\.)(?=.*[A-Z])(?=.*[a-z])(?=.*\\d)(?=.*[\\W,_])[.!-~]{6,}$(?<!\\.)');
  private USERNAME_REGEX = new RegExp('^(?<!\\.)\\d{10}$(?<!\\.)');
  private FULLNAME_REGEX = new RegExp(
    '^(?<!\\.)[a-zA-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠàáâãèéêìíòóôõùúăđĩũơƯĂẠẢẤẦẨẪẬẮẰẲẴẶẸẺẼỀỀỂẾưăạảấầẩẫậắằẳẵặẹẻẽềềểếỄỆỈỊỌỎỐỒỔỖỘỚỜỞỠỢỤỦỨỪễệỉịọỏốồổỗộớờởỡợụủứừỬỮỰỲỴÝỶỸửữựỳỵỷỹs]*$(?<!\\.)'
  );
  private userRepository: Repository<User> = AppDataSource.getRepository(User);

  public async login(request: ILoginRequest, transactionId: string | number): Promise<ILoginResponse> {
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.username, 'username').setRequire().throwValid(invalidParams);
    Utils.validate(request.password, 'password').setRequire().throwValid(invalidParams);
    Utils.validate(request.hash, 'hash').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    const user: User = await this.findAndValidUser(request);
    let password: string = config.app.encryptPassword
      ? await utils.rsaDecrypt(request.password, config.key.rsa.privateKey)
      : request.password;
    if (!(await this.comparePassword(password, user.password))) {
      throw new Errors.GeneralError(Constants.INVALID_CLIENT_CREDENTIAL);
    }
    utils.validHash(request.hash, 'LOGIN');
    const response: ILoginResponse = {
      id: user.id,
      username: user.username,
      status: user.status,
      isVerified: user.verified,
      name: user.name,
    };
    return response;
  }

  public async register(request: IRegisterRequest, transactionId: string | number): Promise<IResultResponse> {
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.username, 'username').setRequire().throwValid(invalidParams);
    Utils.validate(request.password, 'password').setRequire().throwValid(invalidParams);
    Utils.validate(request.otpKey, 'otpKey').setRequire().throwValid(invalidParams);
    Utils.validate(request.hash, 'hash').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    let password: string = config.app.encryptPassword
      ? await utils.rsaDecrypt(request.password, config.key.rsa.privateKey)
      : request.password;
    if (!this.USERNAME_REGEX.test(request.username)) {
      throw new Errors.GeneralError(Constants.USER_NOT_MATCHED_POLICY);
    }
    if (!this.PASSWORD_REGEX.test(password)) {
      throw new Errors.GeneralError(Constants.PASS_NOT_MATCHED_POLICY);
    }
    if (!this.FULLNAME_REGEX.test(request.name)) {
      throw new Errors.GeneralError(Constants.NAME_NOT_MATCHED_POLICY);
    }
    utils.validHash(request.hash, 'REGISTER');
    const clams = await this.tokenService.validateOtpKey(request.otpKey);
    try {
      if (await this.cacheService.findInprogessValidate(request.username, Constants.REGISTER_INPROGESS)) {
        throw new Error(Constants.INPROGESS);
      }
      this.cacheService.addInprogessValidate(request.username, Constants.REGISTER_INPROGESS);
      if ((await this.userRepository.findOneBy({ username: request.username })) != null) {
        throw new Error(Constants.USER_ALREADY_EXISTS);
      }
      const user: User = new User();
      user.username = request.username;
      user.password = await this.hashPassword(password);
      user.phoneNumber = request.username;
      user.status = UserStatus.ACTIVE;
      user.phoneVerified = true;
      user.name = request.name == null ? request.username : request.name;
      AppDataSource.manager.transaction(async (transactionalEntityManager) => {
        await transactionalEntityManager.save(user);
      });
      this.cacheService.removeOtpKey(clams.id);
    } catch (error) {
      throw new Errors.GeneralError(error.message);
    } finally {
      this.cacheService.removeInprogessValidate(request.username, Constants.REGISTER_INPROGESS);
    }
    const response: IResultResponse = {
      status: Constants.REGISTER_SUCCESSFUL,
    };
    return response;
  }

  private async findAndValidUser(request: ILoginRequest): Promise<User> {
    const now: Date = new Date();
    const user: User = await this.userRepository.findOneBy({ username: request.username });
    try {
      let loginValid: ILoginValid = await this.cacheService.findLoginValidate(request.username);
      if (loginValid.failCount >= config.app.loginTemporarilyLocked) {
        if (
          moment(now).isBefore(Utils.addTime(loginValid.lastRequest, config.app.loginTemporarilyLockedTime, 'seconds'))
        ) {
          throw new Error(Constants.LOGIN_TEMPORARILY_LOCKED);
        }
        loginValid.failCount = 1;
      }
      loginValid.failCount = user == null ? loginValid.failCount + 1 : 0;
      loginValid.lastRequest = now;
      this.cacheService.addLoginValidate(loginValid);
    } catch (error: any) {
      if (error.message != Constants.OBJECT_NOT_FOUND) {
        throw new Errors.GeneralError(error.message);
      }
      const loginValid: ILoginValid = {
        username: request.username,
        failCount: user == null ? 1 : 0,
        lastRequest: now,
      };
      this.cacheService.addLoginValidate(loginValid);
    }
    if (user == null) {
      throw new Errors.GeneralError(Constants.INVALID_CLIENT_CREDENTIAL);
    }
    if (UserStatus.ACTIVE != user.status) {
      throw new Errors.GeneralError(Constants.INVALID_ACCOUNT_STATUS);
    }
    return user;
  }

  public async changePassword(
    request: IChangePasswordRequest,
    transactionId: string | number
  ): Promise<IResultResponse> {
    const username: string = request.headers.token.userData.username;
    const userId: number = request.headers.token.userData.id;
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.oldPassword, 'oldPassword').setRequire().throwValid(invalidParams);
    Utils.validate(request.newPassword, 'newPassword').setRequire().throwValid(invalidParams);
    Utils.validate(request.otpKey, 'otpKey').setRequire().throwValid(invalidParams);
    Utils.validate(request.hash, 'hash').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    const oldPassword: string = config.app.encryptPassword
      ? await utils.rsaDecrypt(request.oldPassword, config.key.rsa.privateKey)
      : request.oldPassword;
    const newPassword: string = config.app.encryptPassword
      ? await utils.rsaDecrypt(request.newPassword, config.key.rsa.privateKey)
      : request.newPassword;
    if (newPassword != oldPassword) {
      throw new Errors.GeneralError(Constants.PASSWORD_HAS_NOT_BEEN_CHANGED);
    }
    if (!this.PASSWORD_REGEX.test(newPassword)) {
      throw new Errors.GeneralError(Constants.PASS_NOT_MATCHED_POLICY);
    }
    utils.validHash(request.hash, 'PASSWORD');
    const clams = await this.tokenService.validateOtpKey(request.otpKey);
    try {
      while (await this.cacheService.findInprogessValidate(username, Constants.UPDATE_INPROGESS)) {
        Logger.warn(`${transactionId} waiting do progess`);
      }
      this.cacheService.addInprogessValidate(username, Constants.UPDATE_INPROGESS);
      const user: User = await this.userRepository.findOneBy({ id: userId });
      if (user == null) {
        throw new Error(Constants.USER_NOT_FOUND);
      }
      if (!(await this.comparePassword(oldPassword, user.password))) {
        throw new Error(Constants.INCORRECT_OLD_PASSWORD);
      }
      user.password = await this.hashPassword(newPassword);
      AppDataSource.manager.transaction(async (transactionalEntityManager) => {
        await transactionalEntityManager.save(user);
      });
      this.cacheService.removeOtpKey(clams.id);
    } catch (error) {
      Logger.error('change password error', error);
      throw new Errors.GeneralError(error.message);
    } finally {
      this.cacheService.removeInprogessValidate(username, Constants.UPDATE_INPROGESS);
    }
    const response: IResultResponse = {
      status: Constants.CHANGED_PASSWORD_SUCCESSFULL,
    };
    return response;
  }

  public async resetPassword(request: IResetPasswordRequest, transactionId: string | number): Promise<IResultResponse> {
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.username, 'username').setRequire().throwValid(invalidParams);
    Utils.validate(request.newPassword, 'newPassword').setRequire().throwValid(invalidParams);
    Utils.validate(request.otpKey, 'otpKey').setRequire().throwValid(invalidParams);
    Utils.validate(request.hash, 'hash').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    const newPassword: string = config.app.encryptPassword
      ? await utils.rsaDecrypt(request.newPassword, config.key.rsa.privateKey)
      : request.newPassword;
    if (!this.PASSWORD_REGEX.test(newPassword)) {
      throw new Errors.GeneralError(Constants.PASS_NOT_MATCHED_POLICY);
    }
    utils.validHash(request.hash, 'PASSWORD');
    const clams = await this.tokenService.validateOtpKey(request.otpKey);
    try {
      while (await this.cacheService.findInprogessValidate(request.username, Constants.UPDATE_INPROGESS)) {
        Logger.warn(`${transactionId} waiting do progess`);
      }
      this.cacheService.addInprogessValidate(request.username, Constants.UPDATE_INPROGESS);
      const user: User = await this.userRepository.findOneBy({
        username: request.username,
      });
      if (user == null) {
        throw new Error(Constants.USER_NOT_FOUND);
      }
      if (!(await this.comparePassword(newPassword, user.password))) {
        throw new Error(Constants.PASSWORD_HAS_NOT_BEEN_CHANGED);
      }
      user.password = await this.hashPassword(newPassword);
      AppDataSource.manager.transaction(async (transactionalEntityManager) => {
        await transactionalEntityManager.save(user);
      });
      this.cacheService.removeOtpKey(clams.id);
    } catch (error) {
      Logger.error('reset password error', error);
      throw new Errors.GeneralError(error.message);
    } finally {
      this.cacheService.removeInprogessValidate(request.username, Constants.UPDATE_INPROGESS);
    }
    const response: IResultResponse = {
      status: Constants.RESET_PASSWORD_SUCCESSFULL,
    };
    return response;
  }

  public async checkExist(request: ICheckExistRequest, transactionId: string | number) {
    let invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.value, 'value').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    let response: ICheckExistResponse;
    const user: User = await this.userRepository.findOneBy({ username: request.value });
    if (user != null) {
      response = {
        isExist: true,
        isVerified: user.verified,
      };
    } else {
      response = {
        isExist: false,
        isVerified: false,
      };
    }
    return response;
  }

  public async biometricLogin(request: ILoginRequest, transactionId: string | number) {
    const user: User = await this.findAndValidUser(request);
    const response: ILoginResponse = {
      id: user.id,
      username: user.username,
      status: user.status,
      isVerified: user.verified,
    };
    return response;
  }

  private async hashPassword(plaintextPassword: string | Buffer): Promise<string> {
    return await bcrypt.hash(plaintextPassword, 10);
  }

  private async comparePassword(plaintextPassword: string | Buffer, hash: string): Promise<boolean> {
    return await bcrypt.compare(plaintextPassword, hash);
  }
}
