import { IDataRequest } from 'common/build/src/modules/models';

export default interface IFriendRequest extends IDataRequest {
  friend?: string | number;
  hash?: string;
}
