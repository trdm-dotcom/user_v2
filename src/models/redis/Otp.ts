import { OtpTxType } from '../enum/OtpTxType';
import { OtpIdType } from '../enum/OtpIdType';

export class Otp {
    id: string;
    value: string;
    count: number;
    lastCall: Date;
    failCount: number;
    otpTxType: OtpTxType;
    otpIdType: OtpIdType;

    constructor(id: string, value: string, otpTxType: OtpTxType, otpId: OtpIdType) {
        this.id = id;
        this.value = value;
        this.otpTxType = otpTxType;
        this.otpIdType = this.otpIdType;
    }
}
