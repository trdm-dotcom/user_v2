import 'reflect-metadata';
import config from './Config';
import { Container } from 'typedi';
import { Logger } from 'common';
import { initKafka } from './services/KafkaProducerService';
import RequestHandler from './consumers/RequestHandler';
import RedisService from './services/RedisService';
import { AppDataSource } from './Connection';

Logger.create(config.logger.config, true);
Logger.info('Starting...');

async function run() {
  Logger.info('run service user');
  await AppDataSource.initialize();
  initKafka();
  Container.get(RequestHandler).init();
  Container.get(RedisService).init();
}

run().catch((error) => {
  Logger.error(error);
});
