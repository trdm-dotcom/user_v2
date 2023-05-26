import { Inject, Service } from 'typedi';
import Social from '../models/entities/Social';
import { AppDataSource } from '../Connection';
import { Repository } from 'typeorm';
import { ISocialLoginRequest } from '../models/request/ISocialLoginRequest';
import { Errors, Logger, Utils } from 'common';
import { SocialType } from '../models/enum/SocialType';
import GoogleService from './social/GoogleService';
import FacebookService from './social/FacebookService';
import User from '../models/entities/User';
import FacebookResponse from '../models/response/FacebookResponse';
import Constants from '../Constants';
import { ILoginResponse } from '../models/response/ILoginResponse';
import GoogleResponse from '../models/response/GoogleResponse';
import CacheService from './CacheService';
import { UserStatus } from '../models/enum/UserStatus';
import * as bcrypt from 'bcrypt';
import * as utils from '../utils/Utils';

@Service()
export default class SocialAuthenticateService {
  @Inject()
  private cacheService: CacheService;
  @Inject()
  private googleService: GoogleService;
  @Inject()
  private facebookService: FacebookService;
  private socialRepository: Repository<Social> = AppDataSource.getRepository(Social);
  private userRepository: Repository<User> = AppDataSource.getRepository(User);

  public async login(request: ISocialLoginRequest, transactionId: string | number) {
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.socialToken, 'socialToken').setRequire().throwValid(invalidParams);
    Utils.validate(request.socialType, 'socialType').setRequire().throwValid(invalidParams);
    Utils.validate(request.hash, 'hash').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    utils.validHash(request.hash, 'LOGIN');
    switch (request.socialType) {
      case SocialType.FACEBOOK:
        return await this.facebook(request.socialToken, transactionId);
      case SocialType.GOOGLE:
        return await this.google(request.socialToken, transactionId);
    }
  }

  private async facebook(socialToken: string, transactionId: string | number) {
    var infoId: string = null;
    try {
      const info: FacebookResponse = await this.facebookService.queryFacebookInfo(socialToken, transactionId);
      infoId = info.getId();
      while (this.cacheService.findInprogessValidate(info.getId(), Constants.SOCIAL_INPROGESS, transactionId)) {
        Logger.warn(`${transactionId} waiting do progess`);
      }
      this.cacheService.addInprogessValidate(info.getId(), Constants.SOCIAL_INPROGESS, transactionId);
      const social: Social = await this.socialRepository.findOneBy({
        socicalId: info.getId(),
        socicalType: SocialType.FACEBOOK,
      });
      if (social != null) {
        const user: User = await this.userRepository.findOneBy({ id: social.userid });
        if (user != null) {
          const response: ILoginResponse = {
            id: user.id,
            username: user.username,
            status: user.status,
            isVerified: user.verified,
            name: user.name,
          };
          return response;
        } else {
          throw new Errors.GeneralError(Constants.INVALID_USER);
        }
      }
      const response: ILoginResponse = await AppDataSource.manager.transaction(async (transactionalEntityManager) => {
        let user: User = new User();
        user.username = info.getId();
        user.name = info.getName();
        user.birthDay = Utils.convertStringToDate(info.getBirthday());
        user.status = UserStatus.ACTIVE;
        user.phoneVerified = true;
        user.password = await this.hashPassword(utils.randomAlphabetic(10));
        user.avatar = info.getAvatar();
        user = await transactionalEntityManager.save(user);
        let social: Social = new Social();
        social.socicalId = info.getId();
        social.socicalType = SocialType.FACEBOOK;
        social.profileUrl = info.getProfileUrl();
        social.avatarUrl = info.getAvatar();
        social.userid = user.id;
        await transactionalEntityManager.save(social);
        return {
          id: user.id,
          username: user.username,
          status: user.status,
          isVerified: user.verified,
          name: user.name,
        };
      });
      return response;
    } catch (error) {
      Logger.error(`${transactionId} Error:`, error);
      if (error instanceof Errors.GeneralError) {
        throw error;
      } else {
        throw new Errors.GeneralError();
      }
    } finally {
      if (infoId != null) {
        this.cacheService.removeInprogessValidate(infoId, Constants.SOCIAL_INPROGESS, transactionId);
      }
    }
  }

  private async google(socialToken: string, transactionId: string | number) {
    var infoId: string = null;
    try {
      const info: GoogleResponse = await this.googleService.queryGoogleInfo(socialToken, transactionId);
      infoId = info.getId();
      while (this.cacheService.findInprogessValidate(info.getId(), Constants.SOCIAL_INPROGESS, transactionId)) {
        Logger.warn(`${transactionId} waiting do progess`);
      }
      this.cacheService.addInprogessValidate(info.getId(), Constants.SOCIAL_INPROGESS, transactionId);
      const social: Social = await this.socialRepository.findOneBy({
        socicalId: info.getId(),
        socicalType: SocialType.GOOGLE,
      });
      if (social != null) {
        const user: User = await this.userRepository.findOneBy({ id: social.userid });
        if (user != null) {
          const response: ILoginResponse = {
            id: user.id,
            username: user.username,
            status: user.status,
            isVerified: user.verified,
            name: user.name,
          };
          return response;
        } else {
          throw new Errors.GeneralError(Constants.INVALID_USER);
        }
      }
      const response: ILoginResponse = await AppDataSource.manager.transaction(async (transactionalEntityManager) => {
        let user: User = new User();
        user.username = info.getId();
        user.name = info.getName();
        user.status = UserStatus.ACTIVE;
        user.phoneVerified = true;
        user.password = await this.hashPassword(utils.randomAlphabetic(10));
        user = await transactionalEntityManager.save(user);
        let social: Social = new Social();
        social.socicalId = info.getId();
        social.socicalType = SocialType.GOOGLE;
        social.profileUrl = info.getProfileUrl();
        social.userid = user.id;
        await transactionalEntityManager.save(social);
        return {
          id: user.id,
          username: user.username,
          status: user.status,
          isVerified: user.verified,
          name: user.name,
        };
      });
      return response;
    } catch (error) {
      Logger.error(`${transactionId} Error:`, error);
      if (error instanceof Errors.GeneralError) {
        throw error;
      } else {
        throw new Errors.GeneralError();
      }
    } finally {
      if (infoId != null) {
        this.cacheService.removeInprogessValidate(infoId, Constants.SOCIAL_INPROGESS, transactionId);
      }
    }
  }

  private async hashPassword(plaintextPassword: string | Buffer): Promise<string> {
    return await bcrypt.hash(plaintextPassword, 10);
  }
}
