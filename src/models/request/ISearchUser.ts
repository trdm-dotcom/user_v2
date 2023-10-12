import { IDataRequest } from "common/build/src/modules/models";

export interface ISearchUserRequest extends IDataRequest {
  search: string;
}