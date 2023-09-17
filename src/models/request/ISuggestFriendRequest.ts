import {IDataRequest} from "common/build/src/modules/models";

export interface ISuggestFriendRequest extends IDataRequest{
  phone?: string[];
  search?: string
}
