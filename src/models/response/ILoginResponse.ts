import { UserStatus } from '../enum/UserStatus';

export interface ILoginResponse {
  id?: number;
  status?: UserStatus;
  name?: string;
}
