import { OtpTxType } from '../enum/OtpTxType';

export interface IVerifyOtpKeyRequest {
    username: string;
    otpKey: string;
    type: OtpTxType;
}
