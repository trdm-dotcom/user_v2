export default interface IResetPasswordRequest {
    username?: string;
    newPassword?: string;
    otpKey?: string;
    hash?: string
}
