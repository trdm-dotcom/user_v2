import { SocialType } from '../enum/SocialType';

export interface ISocialLoginRequest {
  socialToken?: string;
  socialType?: SocialType;
}
