import { UserStatus } from '../enum/UserStatus';

export interface ILoginResponse {
    id?: number;
    username?: string;
    isVerified?: boolean;
    status?: UserStatus;
    name?: string;
}
