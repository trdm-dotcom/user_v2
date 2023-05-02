import { UserStatus } from '../enum/UserStatus';

export default interface IUserInfoResponse {
  name?: string;
  username?: string;
  isVerified?: boolean;
  status?: UserStatus;
  deviceToken?: string;
  phoneNumber?: string;
  avatar?: string;
}
