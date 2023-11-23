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
import { createConnection, useContainer } from 'typeorm';
import Job from './services/Job';
import { CronJob } from 'cron';

Logger.create(config.logger.config, true);
Logger.info('Starting...');

async function run() {
  Logger.info('run service user');
  useContainer(ContainerTypeOrm);
  await createConnection({
    ...{
      type: 'mysql',
      entities: [User, Friend],
    },
    ...config.datasource,
  });
  initKafka();
  Container.get(RequestHandler).init();
  Container.get(RedisService).init();

  CronJob.from({
    cronTime: '0 0 0 * * *',
    onTick: function () {
      Container.get(Job).finalDelete();
    },
    start: true,
    timeZone: 'Asia/Ho_Chi_Minh',
  });
}

run().catch((error) => {
  Logger.error(error);
});
