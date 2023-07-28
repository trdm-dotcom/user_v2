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

interface HashData {
  [key: string]: string;
}

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

  // Redis INCR command is used to increment the integer value of a key by one
  public incr(key: string): Promise<any> {
    return new Promise((resolve, reject) => {
      this.client
        .incr(key)
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

  // Redis DECR command is used to decrement the integer value of a key by one
  public decr(key: string): Promise<any> {
    return new Promise((resolve, reject) => {
      this.client
        .decr(key)
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

  public hmset<T>(key: string, values: { [field: string]: T }): void {
    Promise.all(
      Object.entries(values).map(([field, value]) => this.client.hSet(key, field, this.formatDataRedis(value)))
    );
  }

  public exists(key: string): Promise<number> {
    return new Promise((resolve, reject) => {
      this.client
        .exists(key)
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

  public hexists(key: string, field: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.client
        .hExists(key, field)
        .then((result: boolean) => {
          if (result == null) {
            resolve(null);
          } else {
            resolve(result);
          }
        })
        .catch((error: any) => reject(error));
    });
  }

  public hgetall(key: string): Promise<any> {
    return new Promise((resolve, reject) => {
      this.client
        .hGetAll(key)
        .then((results: HashData) => {
          if (results == null) {
            resolve(null);
          } else {
            resolve(
              Object.entries(results).reduce((result, [key, value]) => {
                result[key] = this.convertBackFormatDataRedis(value);
                return result;
              }, {})
            );
          }
        })
        .catch((error: any) => reject(error));
    });
  }

  public zrangebyscore(key: string, min: number, max: number): Promise<any> {
    return new Promise((resolve, reject) => {
      this.client
        .zRangeByScore(key, min, max)
        .then((results: string[]) => {
          if (results == null) {
            resolve(null);
          } else {
            resolve(results.map((element: string) => this.convertBackFormatDataRedis(element)));
          }
        })
        .catch((error: any) => reject(error));
    });
  }

  // Redis ZADD command adds all the specified members with the specified scores to the sorted set stored at the key
  public zadd<T>(key: string, score: number, value: T, option?: any) {
    return new Promise((resolve, reject) => {
      this.client
        .zAdd(key, { score: score, value: this.formatDataRedis(value) }, option)
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

  // Redis SADD command is used to add members to a set stored at the key
  public sadd<T>(key: string, value: T) {
    return new Promise((resolve, reject) => {
      this.client
        .sAdd(key, this.formatDataRedis(value))
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

  public hmget(key: string, fields: string | string[]): Promise<any> {
    return new Promise((resolve, reject) => {
      this.client
        .hmGet(key, fields)
        .then((results: string[]) => {
          if (results == null) {
            resolve(null);
          } else {
            resolve(results.map((element: string) => this.convertBackFormatDataRedis(element)));
          }
        })
        .catch((error: any) => reject(error));
    });
  }

  // Redis SISMEMBER returns an element that already exists in the set stored at the key or not.
  // 1, if the element is a member of the set.
  // 0, if the element is not a member of the set, or if the key does not exist.
  public sismember<T>(key: string, member: T): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.client
        .sIsMember(key, this.formatDataRedis(member))
        .then((result: boolean) => resolve(result))
        .catch((error: any) => reject(error));
    });
  }

  // Redis SMEMBERS returns, all the elements exists in set stored at specified key.
  public smembers(key: string): Promise<any> {
    return new Promise((resolve, reject) => {
      this.client
        .sMembers(key)
        .then((results: string[]) => {
          if (results == null) {
            resolve(null);
          } else {
            resolve(results.map((element: string) => this.convertBackFormatDataRedis(element)));
          }
        })
        .catch((error: any) => reject(error));
    });
  }

  //Redis SREM command is used to remove the specified member from the set stored at the key.
  public srem<T>(key: string, member: T) {
    return new Promise((resolve, reject) => {
      this.client
        .sRem(key, this.formatDataRedis(member))
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

  public zrange(key: string, start: number, end: number): Promise<any> {
    return new Promise((resolve, reject) => {
      this.client
        .zRange(key, start, end)
        .then((results: string[]) => {
          if (results == null) {
            resolve(null);
          } else {
            resolve(results.map((element: string) => this.convertBackFormatDataRedis(element)));
          }
        })
        .catch((error: any) => reject(error));
    });
  }

  public publish<T>(channel: string, data: T) {
    this.client.publish(channel, this.formatDataRedis(data));
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
