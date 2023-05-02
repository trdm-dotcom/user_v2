import { SocialType } from "../enum/SocialType";

export interface ISocialLoginRequest{
    username: string;
    socialToken: string;
    socialType: SocialType;
}