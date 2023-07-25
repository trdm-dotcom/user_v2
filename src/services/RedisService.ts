import { RedisClientType, createClient } from 'redis';
import { Service } from 'typedi';
import config from '../Config';
import { Errors, Logger } from 'common';

const DATA_TYPE = {
  UNDEFINED: 'a',
  NULL: 'b',
  BOOLEAN: '0',
  STRING: '1',
  NUMBER: '2',
  DATE: '3',
  OBJECT: '4',
};

@Service()
export default class RedisService {
  private client: RedisClientType;

  public async init() {
    this.client = createClient(config.redis);
    await this.client.connect();
    this.client.on('connect', () => {
      Logger.info('connected to redis!');
    });
    this.client.on('error', (error: any) => {
      Logger.error(`connected redis error ${error}`);
      throw new Errors.GeneralError();
    });
  }

  public set<T>(key: string, value: T, option?: any) {
    return new Promise((resolve, reject) => {
      this.client
        .set(key, this.formatDataRedis(value), option)
        .then((result: string) => {
          if (result == null) {
            resolve(null);
          } else {
            resolve(result);
          }
        })
        .catch((error: any) => reject(error));
    });
  }

  private formatDataRedis<T>(value: T): string {
    let valueAsString: string = null;
    if (typeof value == undefined) {
      valueAsString = `${DATA_TYPE.UNDEFINED}${value}`;
    } else if (typeof value == null) {
      valueAsString = `${DATA_TYPE.NULL}${value}`;
    } else if (typeof value == 'number') {
      valueAsString = `${DATA_TYPE.NUMBER}${value}`;
    } else if (typeof value == 'string') {
      valueAsString = `${DATA_TYPE.STRING}${value}`;
    } else if (typeof value == 'object') {
      valueAsString = `${DATA_TYPE.OBJECT}${JSON.stringify(value)}`;
    } else if (typeof value == 'boolean') {
      valueAsString = `${DATA_TYPE.BOOLEAN}${value ? 1 : 0}`;
    } else if (value instanceof Date) {
      valueAsString = `${DATA_TYPE.DATE}${(value as unknown as Date).getTime()}`;
    } else {
      valueAsString = `${DATA_TYPE.OBJECT}${JSON.stringify(value)}`;
    }
    return valueAsString;
  }

  private convertBackFormatDataRedis<T>(data: string): any {
    const type: string = data[0];
    let content: string = null;
    switch (type) {
      case DATA_TYPE.UNDEFINED:
        return undefined;
      case DATA_TYPE.NULL:
        return null;
      case DATA_TYPE.DATE:
        content = data.substring(1);
        return new Date(Number(content)) as unknown as T;
      case DATA_TYPE.BOOLEAN:
        content = data.substring(1);
        return (content == '1') as unknown as T;
      case DATA_TYPE.NUMBER:
        content = data.substring(1);
        return content as unknown as T;
      case DATA_TYPE.STRING:
        content = data.substring(1);
        return content as unknown as T;
      default:
        content = data.substring(1);
        return JSON.parse(content, this.receiver);
    }
  }

  private receiver(key: string, value: string): any {
    const dateFormat = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
    if (typeof value == 'string' && dateFormat.test(value)) {
      return new Date(value);
    }
    return value;
  }

  public get(key: string): Promise<any> {
    return new Promise((resolve, reject) => {
      this.client
        .get(key)
        .then((result: string) => {
          if (result == null) {
            resolve(null);
          } else {
            resolve(this.convertBackFormatDataRedis(result));
          }
        })
        .catch((error: any) => reject(error));
    });
  }

  public del(key: string) {
    return new Promise((resolve, reject) => {
      this.client
        .del(key)
        .then((result: number) => {
          if (result == null) {
            resolve(null);
          } else {
            resolve(result);
          }
        })
        .catch((error: any) => reject(error));
    });
  }
}
