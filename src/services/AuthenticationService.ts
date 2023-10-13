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
import { Repository } from 'typeorm';
import { IRegisterRequest } from '../models/request/IRegisterRequest';
import IResultResponse from '../models/response/IResultResponse';
import IChangePasswordRequest from '../models/request/IChangePasswordRequest';
import IResetPasswordRequest from '../models/request/IResetPasswordRequest';
import ICheckExistRequest from '../models/request/ICheckExistRequest';
import ICheckExistResponse from '../models/response/ICheckExistResponse';
import { InjectRepository } from 'typeorm-typedi-extensions';

@Service()
export default class AuthenticationService {
  @Inject()
  private cacheService: CacheService;
  @Inject()
  private tokenService: TokenService;
  @InjectRepository(User)
  private userRepository: Repository<User>;
  private PASSWORD_REGEX = new RegExp('^(?<!\\.)(?=.*[A-Z])(?=.*[a-z])(?=.*\\d)(?=.*[\\W,_])[.!-~]{6,}$(?<!\\.)');
  private PHONE_NUMBER_REGEX = new RegExp('^(?<!\\.)\\d{10}$(?<!\\.)');
  private FULLNAME_REGEX = new RegExp(
    '^(?<!\\.)[a-zA-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠàáâãèéêìíòóôõùúăđĩũơƯĂẠẢẤẦẨẪẬẮẰẲẴẶẸẺẼỀỀỂẾưăạảấầẩẫậắằẳẵặẹẻẽềềểếỄỆỈỊỌỎỐỒỔỖỘỚỜỞỠỢỤỦỨỪễệỉịọỏốồổỗộớờởỡợụủứừỬỮỰỲỴÝỶỸửữựỳỵỷỹs]*$(?<!\\.)'
  );
  private EMAIL_REGEX = new RegExp('^(?<!\\.)[\\w-.]+@([\\w-]+.)+[\\w-]{2,4}$(?<!\\.)');

  public async login(request: ILoginRequest, transactionId: string | number): Promise<ILoginResponse> {
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.username, 'username').setRequire().throwValid(invalidParams);
    Utils.validate(request.password, 'password').setRequire().throwValid(invalidParams);
    Utils.validate(request.hash, 'hash').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    utils.validHash(request.hash, 'LOGIN');
    const user: User = await this.findAndValidUser(request, transactionId);
    let password: string = config.app.encryptPassword
      ? await utils.rsaDecrypt(request.password, config.key.rsa.privateKey)
      : request.password;
    if (!(await this.comparePassword(password, user.password))) {
      throw new Errors.GeneralError(Constants.INVALID_CLIENT_CREDENTIAL);
    }
    const response: ILoginResponse = {
      id: user.id,
      status: user.status,
      name: user.name,
      username: user.phoneNumber,
    };
    return response;
  }

  public async register(request: IRegisterRequest, transactionId: string | number): Promise<ILoginResponse> {
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.name, 'name').setRequire().throwValid(invalidParams);
    Utils.validate(request.email, 'email').setRequire().throwValid(invalidParams);
    Utils.validate(request.phoneNumber, 'phoneNumber').setRequire().throwValid(invalidParams);
    Utils.validate(request.password, 'password').setRequire().throwValid(invalidParams);
    Utils.validate(request.otpKey, 'otpKey').setRequire().throwValid(invalidParams);
    Utils.validate(request.hash, 'hash').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    utils.validHash(request.hash, 'REGISTER');
    let password: string = config.app.encryptPassword
      ? await utils.rsaDecrypt(request.password, config.key.rsa.privateKey)
      : request.password;
    if (!this.EMAIL_REGEX.test(request.email)) {
      throw new Errors.GeneralError(Constants.EMAIL_NOT_MATCHED_POLICY);
    }
    if (!this.PHONE_NUMBER_REGEX.test(request.phoneNumber)) {
      throw new Errors.GeneralError(Constants.PHONE_NUMBER_NOT_MATCHED_POLICY);
    }
    if (!this.PASSWORD_REGEX.test(password)) {
      throw new Errors.GeneralError(Constants.PASS_NOT_MATCHED_POLICY);
    }
    if (!this.FULLNAME_REGEX.test(request.name)) {
      throw new Errors.GeneralError(Constants.NAME_NOT_MATCHED_POLICY);
    }
    const clams = await this.tokenService.validateOtpKey(request.otpKey, transactionId);
    let entityUser: User;
    try {
      if (
        await this.cacheService.findInprogessValidate(request.phoneNumber, Constants.REGISTER_INPROGESS, transactionId)
      ) {
        throw new Errors.GeneralError(Constants.INPROGESS);
      }
      this.cacheService.addInprogessValidate(request.phoneNumber, Constants.REGISTER_INPROGESS, transactionId);
      if ((await this.userRepository.findOne({ phoneNumber: request.phoneNumber })) != null) {
        throw new Errors.GeneralError(Constants.USER_ALREADY_EXISTS);
      }
      if ((await this.userRepository.findOne({ email: request.email })) != null) {
        throw new Errors.GeneralError(Constants.EMAIL_ALREADY_EXISTS);
      }
      const user: User = new User();
      user.email = request.email;
      user.name = request.name;
      user.password = await this.hashPassword(password);
      user.phoneNumber = request.phoneNumber;
      user.status = UserStatus.ACTIVE;
      user.phoneVerified = true;
      entityUser = await this.userRepository.save(user);
      await this.cacheService.removeOtpKey(clams.id, transactionId);
    } catch (error) {
      Logger.error(`${transactionId} Error:`, error);
      if (error instanceof Errors.GeneralError) {
        throw error;
      } else {
        throw new Errors.GeneralError();
      }
    } finally {
      this.cacheService.removeInprogessValidate(request.phoneNumber, Constants.REGISTER_INPROGESS, transactionId);
    }
    const response: ILoginResponse = {
      id: entityUser.id,
      status: entityUser.status,
      name: entityUser.name,
      username: entityUser.phoneNumber,
    };
    return response;
  }

  public async findAndValidUser(request: ILoginRequest, transactionId: string | number): Promise<User> {
    const now: Date = new Date();
    const users: User[] = await this.userRepository
      .createQueryBuilder('user')
      .where('user.phoneNumber = :username or user.email = :username', { username: request.username })
      .getMany();
    if (users.length > 1) {
      throw new Errors.GeneralError(Constants.INVALID_CLIENT_CREDENTIAL);
    }
    const user: User = users[0];
    try {
      let loginValid: ILoginValid = await this.cacheService.findLoginValidate(request.username, transactionId);
      if (loginValid.failCount >= config.app.loginTemporarilyLocked) {
        if (
          moment(now).isBefore(
            Utils.addTime(loginValid.lastRequest, config.app.loginTemporarilyLockedTime, 'milliseconds')
          )
        ) {
          throw new Error(Constants.LOGIN_TEMPORARILY_LOCKED);
        }
        loginValid.failCount = 1;
      }
      loginValid.failCount = user == null ? loginValid.failCount + 1 : 0;
      loginValid.lastRequest = now;
      this.cacheService.addLoginValidate(loginValid, transactionId);
    } catch (error) {
      Logger.error(`${transactionId} Error:`, error);
      if (error instanceof Errors.GeneralError) {
        if ((error as any).code != Constants.OBJECT_NOT_FOUND) {
          throw error;
        }
        const loginValid: ILoginValid = {
          username: request.username,
          failCount: user == null ? 1 : 0,
          lastRequest: now,
        };
        this.cacheService.addLoginValidate(loginValid, transactionId);
      } else {
        throw new Errors.GeneralError();
      }
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
    const userId: number = request.headers.token.userData.id;
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.oldPassword, 'oldPassword').setRequire().throwValid(invalidParams);
    Utils.validate(request.newPassword, 'newPassword').setRequire().throwValid(invalidParams);
    Utils.validate(request.otpKey, 'otpKey').setRequire().throwValid(invalidParams);
    Utils.validate(request.hash, 'hash').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    utils.validHash(request.hash, 'PASSWORD');
    const oldPassword: string = config.app.encryptPassword
      ? await utils.rsaDecrypt(request.oldPassword, config.key.rsa.privateKey)
      : request.oldPassword;
    const newPassword: string = config.app.encryptPassword
      ? await utils.rsaDecrypt(request.newPassword, config.key.rsa.privateKey)
      : request.newPassword;
    if (newPassword == oldPassword) {
      throw new Errors.GeneralError(Constants.PASSWORD_HAS_NOT_BEEN_CHANGED);
    }
    if (!this.PASSWORD_REGEX.test(newPassword)) {
      throw new Errors.GeneralError(Constants.PASS_NOT_MATCHED_POLICY);
    }
    const clams = await this.tokenService.validateOtpKey(request.otpKey, transactionId);
    try {
      while (
        await this.cacheService.findInprogessValidate(userId, Constants.CHANGE_PASSWORD_INPROGESS, transactionId)
      ) {
        Logger.warn(`${transactionId} waiting do progess`);
      }
      this.cacheService.addInprogessValidate(userId, Constants.CHANGE_PASSWORD_INPROGESS, transactionId);
      const user: User = await this.userRepository.findOne({ id: userId });
      if (user == null) {
        throw new Errors.GeneralError(Constants.USER_NOT_FOUND);
      }
      if (!(await this.comparePassword(oldPassword, user.password))) {
        throw new Errors.GeneralError(Constants.INCORRECT_OLD_PASSWORD);
      }
      const hashPassword = await this.hashPassword(newPassword);
      await this.userRepository.update({ id: userId }, { password: hashPassword });
      await this.cacheService.removeOtpKey(clams.id, transactionId);
    } catch (error) {
      Logger.error(`${transactionId} Error:`, error);
      if (error instanceof Errors.GeneralError) {
        throw error;
      } else {
        throw new Errors.GeneralError();
      }
    } finally {
      this.cacheService.removeInprogessValidate(userId, Constants.CHANGE_PASSWORD_INPROGESS, transactionId);
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
    utils.validHash(request.hash, 'PASSWORD');
    const newPassword: string = config.app.encryptPassword
      ? await utils.rsaDecrypt(request.newPassword, config.key.rsa.privateKey)
      : request.newPassword;
    if (!this.PASSWORD_REGEX.test(newPassword)) {
      throw new Errors.GeneralError(Constants.PASS_NOT_MATCHED_POLICY);
    }
    let userId: number;
    try {
      const clams = await this.tokenService.validateOtpKey(request.otpKey, transactionId);
      const users: User[] = await this.userRepository
        .createQueryBuilder('user')
        .where('user.phoneNumber = :username or user.email = :username', {
          username: request.username,
        })
        .getMany();
      if (users.length == 0) {
        throw new Errors.GeneralError(Constants.INVALID_USER);
      }
      const user: User = users[0];
      userId = user.id;
      while (
        await this.cacheService.findInprogessValidate(userId, Constants.CHANGE_PASSWORD_INPROGESS, transactionId)
      ) {
        Logger.warn(`${transactionId} waiting do progess`);
      }
      this.cacheService.addInprogessValidate(userId, Constants.CHANGE_PASSWORD_INPROGESS, transactionId);
      if (user == null) {
        throw new Errors.GeneralError(Constants.USER_NOT_FOUND);
      }
      if (await this.comparePassword(newPassword, user.password)) {
        throw new Errors.GeneralError(Constants.PASSWORD_HAS_NOT_BEEN_CHANGED);
      }
      const hashPassword = await this.hashPassword(newPassword);
      await this.userRepository.update({ id: userId }, { password: hashPassword });
      await this.cacheService.removeOtpKey(clams.id, transactionId);
    } catch (error) {
      Logger.error(`${transactionId} Error:`, error);
      if (error instanceof Errors.GeneralError) {
        throw error;
      } else {
        throw new Errors.GeneralError();
      }
    } finally {
      this.cacheService.removeInprogessValidate(userId, Constants.CHANGE_PASSWORD_INPROGESS, transactionId);
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
    const users: User[] = await this.userRepository
      .createQueryBuilder('user')
      .where('user.phoneNumber = :value or user.email = :value', { value: request.value })
      .getMany();
    if (users.length > 0) {
      response = {
        isExist: true,
      };
    } else {
      response = {
        isExist: false,
      };
    }
    return response;
  }

  private async hashPassword(plaintextPassword: string | Buffer): Promise<string> {
    return await bcrypt.hash(plaintextPassword, 10);
  }

  private async comparePassword(plaintextPassword: string | Buffer, hash: string): Promise<boolean> {
    return await bcrypt.compare(plaintextPassword, hash);
  }
}
