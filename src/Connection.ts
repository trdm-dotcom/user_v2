import { DataSource } from 'typeorm';
import config from './Config';
import User from './models/entities/User';
import Friend from './models/entities/Friend';
import Social from './models/entities/Social';

export const AppDataSource = new DataSource({
  ...{
    type: 'mysql',
    entities: [User, Friend, Social],
  },
  ...config.datasource,
});
