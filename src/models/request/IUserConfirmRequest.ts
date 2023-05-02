import { IDataRequest } from 'common/build/src/modules/models';

export default interface IUserConfirmRequest extends IDataRequest {
  password?: string;
}
