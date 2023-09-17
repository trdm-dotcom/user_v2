import 'reflect-metadata';
import config from './Config';
import { Container } from 'typedi';
import { Logger } from 'common';
import { initKafka } from './services/KafkaProducerService';
import RequestHandler from './consumers/RequestHandler';
import RedisService from './services/RedisService';
import { Container as ContainerTypeOrm } from 'typeorm-typedi-extensions';
import User from './models/entities/User';
import Friend from './models/entities/Friend';
import Social from './models/entities/Social';
import { createConnection, useContainer } from 'typeorm';
import Biometric from './models/entities/Biometric';

Logger.create(config.logger.config, true);
Logger.info('Starting...');

async function run() {
  Logger.info('run service user');
  useContainer(ContainerTypeOrm);
  await createConnection({
    ...{
      type: 'mysql',
      entities: [User, Friend, Social, Biometric],
    },
    ...config.datasource,
  });
  initKafka();
  Container.get(RequestHandler).init();
  Container.get(RedisService).init();
}

run().catch((error) => {
  Logger.error(error);
});
