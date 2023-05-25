import { IDataRequest } from "common/build/src/modules/models";

export default interface ICancelBiometricRegister extends IDataRequest {
  deviceId: string
}