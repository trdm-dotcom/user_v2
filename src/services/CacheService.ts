import { Inject, Service } from 'typedi';
import RedisService from './RedisService';
import { Errors, Logger, Utils } from 'common';
import config from '../Config';
import Constants from '../Constants';
import ILoginValid from '../models/redis/ILoginValid';
import { Otp } from '../models/redis/Otp';

const OTP_KEY_STORAGE = 'otp_key_storage';
const LOGIN_VALIDATE = 'login_validate';

@Service()
export default class CacheService {
  @Inject()
  private redisService: RedisService;

  public addLoginValidate(loginValid: ILoginValid, transactionId: string | number): void {
    Logger.info(`${transactionId} add Login Information for Validate`);
    let realKey: string = `${LOGIN_VALIDATE}_${loginValid.username}_${Utils.formatDateToDisplay(
      Utils.addTime(new Date(), 7, 'h')
    )}`;
    this.redisService.set(realKey, loginValid, { EX: config.app.lifeTime });
  }

  public async findLoginValidate(username: string, transactionId: string | number): Promise<ILoginValid> {
    Logger.info(`${transactionId} find Login Information by username ${username}`);
    let realKey: string = `${LOGIN_VALIDATE}_${username}_${Utils.formatDateToDisplay(
      Utils.addTime(new Date(), 7, 'h')
    )}`;
    try {
      const loginValid: ILoginValid = await this.redisService.get<ILoginValid>(realKey);
      if (loginValid) {
        return loginValid;
      } else {
        throw new Errors.GeneralError(Constants.OBJECT_NOT_FOUND);
      }
    } catch (error) {
      if (error instanceof Errors.GeneralError) {
        throw error;
      } else {
        throw new Errors.GeneralError();
      }
    }
  }

  public removeLoginValidate(username: string, transactionId: string | number): void {
    Logger.info(`${transactionId} remote login Validate ${username}`);
    let realKey: string = `${LOGIN_VALIDATE}_${username}_${Utils.formatDateToDisplay(
      Utils.addTime(new Date(), 7, 'h')
    )}`;
    this.redisService.set(realKey, '', { PX: 1 });
  }

  public async findOtpKey(key: string, transactionId: string | number): Promise<Otp> {
    Logger.info(`${transactionId} find OtpKey Validate ${key}`);
    let realKey: string = `${OTP_KEY_STORAGE}_${key}`;
    return await this.redisService.get<any>(realKey);
  }

  public async removeOtpKey(key: string, transactionId: string | number) {
    Logger.info(`${transactionId} remote OtpKey Validate ${key}`);
    if (key) {
      let realKey: string = `${OTP_KEY_STORAGE}_${key}`;
      this.redisService.set(realKey, '', { PX: 1 });
    }
  }

  public async findInprogessValidate(key: any, type: string, transactionId: string | number) {
    Logger.info(`${transactionId} find inprogess type ${type} key ${key}`);
    let realKey: string = `${type}_${key}`;
    return await this.redisService.get<any>(realKey);
  }

  public addInprogessValidate(key: any, type: string, transactionId: string | number) {
    Logger.info(`${transactionId} add inprogess type ${type} key ${key}`);
    let realKey: string = `${type}_${key}`;
    this.redisService.set(realKey, key, { EX: config.app.cacheTTL });
  }

  public removeInprogessValidate(key: any, type: string, transactionId: string | number) {
    Logger.info(`${transactionId} remove inprogess type ${type} key ${key}`);
    let realKey: string = `${type}_${key}`;
    this.redisService.set(realKey, '', { PX: 1 });
  }
}
