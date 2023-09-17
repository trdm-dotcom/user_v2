import { UserStatus } from '../enum/UserStatus';

export default interface IUserInfoResponse {
  id?: number;
  name?: string;
  status?: UserStatus;
  phoneNumber?: string;
  email?: string;
  avatar?: string;
  birthDay?: Date;
}
