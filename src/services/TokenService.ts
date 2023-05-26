import { Inject, Service } from 'typedi';
import CacheService from './CacheService';
import * as jwt from 'jsonwebtoken';
import { getKey } from '../utils/Utils';
import config from '../Config';

import Constants from '../Constants';
import { Otp } from '../models/redis/Otp';
import { OtpTxType } from '../models/enum/OtpTxType';
import { Errors, Logger } from 'common';

@Service()
export default class TokenService {
  @Inject()
  private cacheService: CacheService;

  public async validateOtpKey(token: string, transactionId: string | number) {
    let key: Buffer = getKey(config.key.jwt.privateKey);
    try {
      let clams = await jwt.verify(token, key, { algorithms: 'RS256' });
      let otp: Otp = await this.cacheService.findOtpKey(clams.id, transactionId);
      Logger.warn(`otp ${JSON.stringify(otp)}`);
      if (!otp || !Object.values(OtpTxType).includes(clams.txType)) {
        throw new Errors.GeneralError(Constants.INVALID_OTP_KEY);
      }
      return clams;
    } catch (error) {
      Logger.error(`${transactionId} Error:`, error);
      if (error instanceof Errors.GeneralError) {
        throw error;
      }
      switch (error.message) {
        case 'jwt expired':
          throw new Errors.GeneralError(Constants.OTP_KEY_EXPIRED);
        default:
          throw new Errors.GeneralError(Constants.INVALID_OTP_KEY);
      }
    }
  }
}
