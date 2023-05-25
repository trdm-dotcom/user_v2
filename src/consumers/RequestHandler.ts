import { Errors, Kafka, Logger } from 'common';
import { Inject, Service } from 'typedi';
import config from '../Config';
import AuthenticationService from '../services/AuthenticationService';
import UserService from '../services/UserService';
import FriendService from '../services/FriendService';
import BiometricService from '../services/BiometricService';
import SocialAuthenticateService from '../services/SocialAuthenticateService';

@Service()
export default class RequestHandler {
  @Inject()
  private authenticationService: AuthenticationService;
  @Inject()
  private userService: UserService;
  @Inject()
  private friendService: FriendService;
  @Inject()
  private biometricService: BiometricService;
  @Inject()
  private socialAuthenticateService: SocialAuthenticateService;

  public init() {
    const handle: Kafka.KafkaRequestHandler = new Kafka.KafkaRequestHandler(Kafka.getInstance());
    Kafka.createConsumer(
      config,
      config.kafkaConsumerOptions,
      config.requestHandlerTopics,
      (message: Kafka.IKafkaMessage) => handle.handle(message, this.handleRequest),
      config.kafkaTopicOptions
    );
  }

  private handleRequest: Kafka.Handle = async (message: Kafka.IMessage) => {
    Logger.info('Endpoint received message: ', message);
    if (message == null || message.data == null) {
      return Promise.reject(new Errors.SystemError());
    } else {
      switch (message.uri) {
        case 'post:/api/v1/register':
          return await this.authenticationService.register(message.data, message.transactionId);

        case 'post:/api/v1/login':
          return await this.authenticationService.login(message.data, message.transactionId);

        case 'post:/api/v1/user/changePassword':
          return await this.authenticationService.changePassword(message.data, message.transactionId);

        case 'post:/api/v1/user/resetPassword':
          return await this.authenticationService.resetPassword(message.data, message.transactionId);

        case 'post:/api/v1/login/social':
          return await this.socialAuthenticateService.login(message.data, message.transactionId);

        case 'post:/api/v1/login/biometric':
          return await this.biometricService.login(message.data, message.transactionId);

        case 'post:/api/v1/user/checkExist':
          return await this.authenticationService.checkExist(message.data, message.transactionId);

        case 'put:/api/v1/user/info':
          return await this.userService.putUserInfo(message.data, message.transactionId);

        case 'get:/api/v1/user/info':
          return await this.userService.getUserInfo(message.data, message.transactionId);

        case 'get:/api/v1/user/search':
          return await this.userService.searchUser(message.data, message.transactionId);

        case 'post:/api/v1/user/confirm':
          return await this.userService.confirmUser(message.data, message.transactionId);

        case 'delete:/api/v1/user':
          return await this.userService.disableUser(message.data, message.transactionId);

        case 'post:/api/v1/user/friend':
          return await this.friendService.requestFriend(message.data, message.transactionId);

        case 'put:/api/v1/user/friend':
          return await this.friendService.acceptFriend(message.data, message.transactionId);

        case 'delete:/api/v1/user/friend':
          return await this.friendService.rejectFriend(message.data, message.transactionId);

        case 'get:/api/v1/user/friend':
          return await this.friendService.getFriend(message.data, message.transactionId);

        case 'post:/api/v1/user/friend/request':
          return await this.friendService.requestAndAcceptFriend(message.data, message.transactionId);

        case 'get:/api/v1/user/friend/request':
          return await this.friendService.getRequestFriend(message.data, message.transactionId);

        case 'post:/api/v1/user/bio/registerBiometric':
          return await this.biometricService.registerBiometric(message.data, message.transactionId);

        case 'get:/api/v1/user/bio/queryBiometricStatus':
          return await this.biometricService.queryBiometricStatus(message.data, message.transactionId);

        case 'delete:/api/v1/user/bio/cancelBiometricRegister':
          return await this.biometricService.cancelBiometricRegister(message.data, message.transactionId);

        default:
          return false;
      }
    }
  };
}
