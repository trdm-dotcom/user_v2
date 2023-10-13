import { Inject, Service } from 'typedi';
import { EntityManager, Repository } from 'typeorm';
import Biometric from '../models/entities/Biometric';
import { IBiometricRegisterRequest } from '../models/request/IBiometricRegisterRequest';
import { Errors, Logger, Utils } from 'common';
import Constants from '../Constants';
import { BiometricStatus } from '../models/enum/BiometricStatus';
import IBiometricStatusRequest from '../models/request/IBiometricStatusRequest';
import IBiometricLoginRequest from '../models/request/IBiometricLoginRequest';
import User from '../models/entities/User';
import * as crypto from 'crypto';
import ICancelBiometricRegister from '../models/request/ICancelBiometricRegister';
import AuthenticationService from './AuthenticationService';
import { ILoginRequest } from '../models/request/ILoginRequest';
import { ILoginResponse } from '../models/response/ILoginResponse';
import * as utils from '../utils/Utils';
import { InjectManager, InjectRepository } from 'typeorm-typedi-extensions';

@Service()
export default class BiometricService {
  @Inject()
  private authenticationService: AuthenticationService;
  @InjectRepository(Biometric)
  private biometricRepository: Repository<Biometric>;
  @InjectManager()
  private manager: EntityManager;

  public async registerBiometric(request: IBiometricRegisterRequest, transactionId: string | number) {
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.publicKey, 'publicKey').setRequire().throwValid(invalidParams);
    Utils.validate(request.secretKey, 'secretKey').setRequire().throwValid(invalidParams);
    Utils.validate(request.deviceId, 'deviceId').setRequire().throwValid(invalidParams);
    Utils.validate(request.hash, 'hash').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    utils.validHash(request.hash, 'BIOMETRIC');
    await this.registerBiometricValidation(request.headers.token.userData.username, request.publicKey, transactionId);
    const biometric: Biometric = new Biometric();
    biometric.userid = request.headers.token.userData.id;
    biometric.username = request.headers.token.userData.username;
    biometric.publicKey = request.publicKey;
    biometric.isDeleted = false;
    biometric.status = BiometricStatus.ACTIVE;
    biometric.deviceId = request.deviceId;
    biometric.secretKey = request.secretKey;
    const enityBiometric: Biometric = await this.biometricRepository.save(biometric);
    return { biometricId: enityBiometric.id };
  }

  public async queryBiometricStatus(request: IBiometricStatusRequest, transactionId: string | number) {
    if (request.publicKey != null) {
      const biometrices: Biometric[] = await this.biometricRepository.find({
        userid: request.userId,
        status: BiometricStatus.ACTIVE,
        isDeleted: false,
        publicKey: request.publicKey,
      });
      return { isEnable: biometrices.length > 0 };
    } else {
      const biometrices: Biometric[] = await this.biometricRepository.find({
        userid: request.userId,
        status: BiometricStatus.ACTIVE,
        isDeleted: false,
        deviceId: request.deviceId,
      });
      return { isEnable: biometrices.length > 0 };
    }
  }

  public async cancelBiometricRegister(request: ICancelBiometricRegister, transactionId: string | number) {
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.deviceId, 'deviceId').setRequire().throwValid(invalidParams);
    Utils.validate(request.hash, 'hash').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    utils.validHash(request.hash, 'BIOMETRIC');
    const biometrics: Biometric[] = await this.findBiometricByUsernameAndDeviceId(
      request.headers.token.userData.username,
      false,
      request.deviceId,
      BiometricStatus.ACTIVE
    );
    if (biometrics == null || biometrics.length < 1) {
      throw new Errors.GeneralError(Constants.BIOMETRIC_NOT_FOUND);
    }
    await this.updateBiometric(biometrics[0], true, Constants.BIOMETRIC_CANCEL);
  }

  public async login(request: IBiometricLoginRequest, transactionId: string | number) {
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.signatureValue, 'signatureValue').setRequire().throwValid(invalidParams);
    Utils.validate(request.username, 'username').setRequire().throwValid(invalidParams);
    Utils.validate(request.hash, 'hash').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    utils.validHash(request.hash, 'LOGIN');
    let publicKey = `-----BEGIN PUBLIC KEY-----\n{key}\n-----END PUBLIC KEY-----`;
    const verify = crypto.createVerify('RSA-SHA256');
    const biometrics: Biometric[] = await this.findBiometricByUsernameAndDeviceId(
      request.username,
      false,
      request.deviceid,
      BiometricStatus.ACTIVE
    );
    if (biometrics == null || biometrics.length < 1) {
      throw new Errors.GeneralError(Constants.BIOMETRIC_NOT_FOUND);
    }
    publicKey = publicKey.replace(/{key}/g, biometrics[0].publicKey);
    verify.update(request.username.toUpperCase());
    if (!verify.verify(publicKey, request.signatureValue, 'base64')) {
      throw new Errors.GeneralError(Constants.BIOMETRIC_VERIFY_FAILED);
    }
    const loginRequest: ILoginRequest = {
      username: request.username,
    };
    const user: User = await this.authenticationService.findAndValidUser(loginRequest, transactionId);
    const response: ILoginResponse = {
      id: user.id,
      status: user.status,
      name: user.name,
      username: user.phoneNumber,
    };
    return response;
  }

  private async registerBiometricValidation(username: string, publicKey: string, transactionId: string | number) {
    const listBio: Biometric[] = await this.biometricRepository.find({
      where: [{ username: username }],
    });
    if (listBio.length > 0) {
      if (listBio[0].publicKey === publicKey) {
        throw new Errors.GeneralError(Constants.BIOMETRIC_PUBLIC_KEY_EXISTED);
      }
      Logger.info(`${transactionId} already exist biometric register for account, start unactivated this biometric`);
      this.updateBiometric(listBio[0], true, Constants.BIOMETRIC_CHANGE_DEVICE);
      Logger.info(`${transactionId} finish update biometric`);
    }
  }

  private async updateBiometric(biometric: Biometric, status: boolean, reason: string) {
    await this.manager.transaction(async (transactionalEntityManager) => {
      biometric.status = BiometricStatus.INACTIVE;
      biometric.isDeleted = status;
      biometric.deleteReason = biometric.status == BiometricStatus.INACTIVE ? Constants.BIOMETRIC_OTP_VERIFY : reason;
      await transactionalEntityManager.save(biometric);
    });
  }

  private async findBiometricByUsernameAndDeviceId(
    username: string,
    isDeleted: boolean,
    deviceId: string,
    status?: BiometricStatus
  ) {
    if (status != null) {
      return await this.biometricRepository.find({
        username: username,
        isDeleted: isDeleted,
        status: status,
        deviceId: deviceId,
      });
    } else {
      return await this.biometricRepository.find({
        username: username,
        isDeleted: isDeleted,
        deviceId: deviceId,
      });
    }
  }
}
