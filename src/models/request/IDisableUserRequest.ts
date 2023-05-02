import { IDataRequest } from 'common/build/src/modules/models';

export default interface IDisableUserRequest extends IDataRequest {
  hash?: string;
  otpKey?: string;
}
