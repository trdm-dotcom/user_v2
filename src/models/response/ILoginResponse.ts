import { UserStatus } from '../enum/UserStatus';

export interface ILoginResponse {
  id?: number;
  username?: string;
  status?: UserStatus;
  name?: string;
}
