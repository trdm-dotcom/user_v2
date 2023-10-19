import { FriendStatus } from '../enum/FriendStatus';
import IUserInfoResponse from './IUserInfoResponse';

export default interface IFriendResponse extends IUserInfoResponse {
  statusFriend: FriendStatus;
  friendId: number;
}
