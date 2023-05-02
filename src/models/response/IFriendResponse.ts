import { FriendStatus } from '../enum/FriendStatus';

export default interface IFriendResponse {
  friend?: string;
  name?: string;
  status?: FriendStatus;
  avatar?: string;
}
