import { Inject, Service } from "typedi";
import RedisService from "./RedisService";
import { Logger, Utils } from "common";
import config from "../Config";
import Constants from "../Constants";
import ILoginValid from "../models/redis/ILoginValid";
import { Otp } from "../models/redis/Otp";

const OTP_KEY_STORAGE = "otp_key_storage";
const LOGIN_VALIDATE = "login_validate";

@Service()
export default class CacheService {
  @Inject()
  private redisService: RedisService;

  public addLoginValidate(loginValid: ILoginValid): void {
    Logger.info("add Login Information for Validate", loginValid.toString());
    let realKey: string = `${LOGIN_VALIDATE}_${loginValid.username
      }_${Utils.formatDateToDisplay(Utils.addTime(new Date(), 7, "h"))}`;
    this.redisService.set(realKey, loginValid, { EX: config.app.lifeTime });
  }

  public async findLoginValidate(username: string): Promise<ILoginValid> {
    Logger.info("find Login Information by username", username);
    let realKey: string = `${LOGIN_VALIDATE}_${username}_${Utils.formatDateToDisplay(
      Utils.addTime(new Date(), 7, "h")
    )}`;
    try {
      const loginValid: ILoginValid = await this.redisService.get<ILoginValid>(
        realKey
      );
      if (loginValid) {
        return loginValid;
      } else {
        throw new Error(Constants.OBJECT_NOT_FOUND);
      }
    } catch (error: any) {
      throw new Error(error.message);
    }
  }

  public removeLoginValidate(username: string): void {
    Logger.info("remote login Validate ", username);
    let realKey: string = `${LOGIN_VALIDATE}_${username}_${Utils.formatDateToDisplay(
      Utils.addTime(new Date(), 7, "h")
    )}`;
    this.redisService.set(realKey, "", { PX: 1 });
  }

  public async findOtpKey(key: string): Promise<Otp> {
    Logger.info("find OtpKey Validate ", key);
    let realKey: string = `${OTP_KEY_STORAGE}_${key}`;
    try {
      return await this.redisService.get<any>(realKey);
    } catch (error: any) {
      throw new Error(error.message);
    }
  }

  public async removeOtpKey(key: string) {
    if(key) {
      Logger.info("remote OtpKey Validate ", key);
      let realKey: string = `${OTP_KEY_STORAGE}_${key}`;
      this.redisService.set(realKey, "", { PX: 1 });
    }
  }

  public async findInprogessValidate(user: any, type: string) {
    Logger.info(`find inprogess type ${type} user ${user}`);
    let realKey: string = `${type}_${user}`;
    try {
      return await this.redisService.get<any>(realKey);
    } catch (error: any) {
      throw new Error(error.message);
    }
  }

  public addInprogessValidate(user: any, type: string) {
    Logger.info(`add inprogess type ${type} user ${user}`);
    let realKey: string = `${type}_${user}`;
    this.redisService.set(realKey, user);
  }

  public removeInprogessValidate(user: any, type: string) {
    let realKey: string = `${type}_${user}`;
    Logger.info(`remote inprogess ${realKey}`);
    this.redisService.set(realKey, "", { PX: 1 });
  }
}
