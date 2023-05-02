import 'reflect-metadata';
import config from './Config';
import { Container } from 'typedi';
import { createService, Kafka, Logger } from 'common';
import RequestHandler from './consumers/RequestHandler';
import RedisService from './services/RedisService';
import { AppDataSource } from './Connection';

Logger.create(config.logger.config, true);
Logger.info('Starting...');

function init() {
  try {
    Logger.info('run service user');
    Kafka.create(
      config,
      true,
      null,
      {
        serviceName: config.clusterId,
        nodeId: config.clientId,
      },
      config.kafkaProducerOptions,
      {},
      config.kafkaConsumerOptions,
      {}
    );
    Promise.all([
      AppDataSource.initialize(),
      new Promise((resolve: (value: unknown) => void, reject: (reason?: any) => void) => {
        createService(Kafka.getInstance(), {
          serviceName: config.clusterId,
          nodeId: config.clientId,
          listeningTopic: config.topic.userinfo,
        });
        resolve(`createService ${config.topic.userinfo}`);
      }),
      new Promise((resolve: (value: unknown) => void, reject: (reason?: any) => void) => {
        Container.get(RequestHandler).init();
        resolve(`init container RequestHandler`);
      }),
      new Promise((resolve: (value: unknown) => void, reject: (reason?: any) => void) => {
        Container.get(RedisService).init();
        resolve(`init container RedisService`);
      }),
    ]);
  } catch (error) {
    Logger.error(error);
    process.exit(1);
  }
}

init();
