import { Utils } from 'common';

let config = {
  logger: {
    config: {
      appenders: {
        application: { type: 'console' },
        file: {
          type: 'file',
          filename: './../logs/user/application.log',
          compression: true,
          maxLogSize: 10485760,
          backups: 100,
        },
      },
      categories: {
        default: { appenders: ['application', 'file'], level: 'info' },
      },
    },
  },
  topic: {
    pushNotification: 'notification-manager',
    notification: 'notification',
  },
  clusterId: 'user',
  clientId: `user-${Utils.getEnvNum('ENV_NODE_ID')}`,
  nodeId: Utils.getEnvNum('ENV_NODE_ID'),
  kafkaUrls: Utils.getEnvArr('ENV_KAFKA_URLS'),
  kafkaCommonOptions: {},
  kafkaConsumerOptions: {},
  kafkaProducerOptions: {},
  kafkaTopicOptions: {},
  requestHandlerTopics: [],
  redis: {
    url: `redis://${Utils.getEnvStr('ENV_REDIS_HOST')}:${Utils.getEnvStr('ENV_REDIS_PORT')}`,
  },
  datasource: {
    host: Utils.getEnvStr('ENV_MYSQL_HOST'),
    port: Utils.getEnvNum('ENV_MYSQL_PORT'),
    username: Utils.getEnvStr('ENV_MYSQL_USER'),
    password: Utils.getEnvStr('ENV_MYSQL_PASSWORD'),
    database: 'user',
    timezone: 'UTC',
    synchronize: false,
    logging: false,
    poolSize: 10,
  },
  app: {
    cacheTTL: 300000, //milliseconds
    lifeTime: 86400000, //milliseconds
    encryptPassword: true,
    loginTemporarilyLocked: 5, // times
    loginTemporarilyLockedTime: 1800000, //milliseconds
    timeStampHash: 30000, // milliseconds
    template: {
      deleteAccount: 'delete_account',
    },
  },
  key: {
    jwt: {
      publicKey: './key/jwt_public.key',
      privateKey: './key/jwt_private.key',
    },
    rsa: {
      enableEncryptPassword: true,
      publicKey: './key/rsa_public.key',
      privateKey: './key/rsa_private.key',
    },
    aes: {
      key: 'IaPON8rXjCQ5TIUVYBtcw8WKGCfcQEtc',
      iv: 'jI4j7fqHWO',
      keyHash: 'wfyxb3sR1O',
    },
  },
};

config.kafkaConsumerOptions = {
  ...(config.kafkaCommonOptions ? config.kafkaCommonOptions : {}),
  ...(config.kafkaConsumerOptions ? config.kafkaConsumerOptions : {}),
};
config.kafkaProducerOptions = {
  ...(config.kafkaCommonOptions ? config.kafkaCommonOptions : {}),
  ...(config.kafkaProducerOptions ? config.kafkaProducerOptions : {}),
};

if (config.requestHandlerTopics.length == 0) {
  config.requestHandlerTopics.push(config.clusterId);
}

export default config;
