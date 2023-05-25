import { IDataRequest } from 'common/build/src/modules/models';

export interface IBiometricRegisterRequest extends IDataRequest {
  secretKey?: string;
  publicKey?: string;
  deviceId?: string;
}
