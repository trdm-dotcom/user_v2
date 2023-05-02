import { IDataRequest } from "common/build/src/modules/models";

export default interface IChangePasswordRequest extends IDataRequest {
    oldPassword?: string;
    newPassword?: string;
    otpKey?: string;
    hash?: string;
}
