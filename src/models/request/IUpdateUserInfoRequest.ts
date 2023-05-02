import { IDataRequest } from 'common/build/src/modules/models';

export interface IUpdateUserInfoRequest extends IDataRequest {
  name?: string;
  birthDay?: string;
}
