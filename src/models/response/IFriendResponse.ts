import IUserInfoResponse from './IUserInfoResponse';

export default interface IFriendResponse extends IUserInfoResponse {
  friendId: number;
  isAccept: boolean;
  friendStatus: string;
}
