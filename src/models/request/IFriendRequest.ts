import { IDataRequest } from 'common/build/src/modules/models';

export default interface IFriendRequest extends IDataRequest {
  friend: number;
  pageSize: number;
  pageNumber: number;
  search: string;
}
