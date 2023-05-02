import { readFileSync } from 'fs';
import { privateDecrypt, publicEncrypt } from 'crypto';
import { Errors, FirebaseConfiguration, FirebaseType, Kafka, Logger, MethodEnum, NotificationMessage } from 'common';
import config from '../Config';
import * as jwt from 'jsonwebtoken';
import { AES, enc, pad, mode } from 'crypto-js';
import Constants from '../Constants';
import { ObjectMapper } from 'jackson-js';
import { OtpIdType } from '../models/enum/OtpIdType';
import { OtpTxType } from '../models/enum/OtpTxType';
import { IVerifyOtpKeyRequest } from '../models/request/IVerifyOtpKeyRequest';
import * as moment from 'moment';

const MULTI_ENCRYPTION_PART_PREFIX = 'mutipart';

export function rsaEncrypt(data, pathPublicKey) {
  let key = getKey(pathPublicKey);
  try {
    return encrypt(data, key);
  } catch (error) {
    if (error.message != null && error.message.indexOf('data too large for key size') >= 0) {
      let encryption = MULTI_ENCRYPTION_PART_PREFIX;
      let index = 0;
      while (index < data.length) {
        const part = data.substr(index, Math.min(100, data.length - index));
        encryption += `.${encrypt(part, key)}`;
        index += 100;
      }
      return encryption;
    }
    throw error;
  }
}

function encrypt(data, key) {
  let buffer = Buffer.from(data);
  let encrypt = publicEncrypt({ key: key, padding: 1 }, buffer);
  return encrypt.toString('base64');
}

export async function rsaDecrypt(data, pathPrivateKey): Promise<string> {
  const key: Buffer = getKey(pathPrivateKey);
  if (data.startsWith(`${MULTI_ENCRYPTION_PART_PREFIX}`)) {
    const parts = data.split('.');
    let result = '';
    for (let i = 1; i < parts.length; i++) {
      result += decrypt(parts[i], key);
    }
    return result;
  } else {
    return decrypt(data, key);
  }
}

function decrypt(data: string | Buffer, key: Buffer) {
  let buffer: Buffer;
  if (typeof data == 'string') {
    buffer = Buffer.from(data, 'base64');
  } else {
    buffer = data;
  }
  const decrypt = privateDecrypt({ key: key, padding: 1 }, buffer);
  return decrypt.toString('utf-8');
}

export function getKey(filename): Buffer {
  return readFileSync(filename);
}

export function validateOtpKey(request: IVerifyOtpKeyRequest) {
  Logger.info('validation Otp Key with input ' + request.toString());
  let key = getKey(config.key.jwt.privateKey);
  let payload: any = jwt.verify(request.otpKey, key, { algorithms: 'RS256' });
  Logger.info('payload: ' + payload);
  if (
    !Object.values(OtpIdType).includes(payload.idType) ||
    !Object.values(OtpTxType).includes(payload.txType) ||
    request.username != payload.username
  ) {
    throw new Errors.GeneralError(Constants.INVALID_OTP_KEY);
  }
}

export function aesDecrypt(data: string) {
  return AES.decrypt(data, enc.Utf8.parse(config.key.aes.key), {
    iv: enc.Utf8.parse(config.key.aes.iv),
    padding: pad.Pkcs7,
    mode: mode.CBC,
  }).toString(enc.Utf8);
}

export function aesEncrypt(data: string) {
  return AES.encrypt(data, enc.Utf8.parse(config.key.aes.key), {
    iv: enc.Utf8.parse(config.key.aes.iv),
    padding: pad.Pkcs7,
    mode: mode.CBC,
  });
}

export function convertToHashObject(hash: string) {
  let hashObject = new Map();
  while (hash.length > 0) {
    let endKey = hash.indexOf('=');
    let endValue = hash.indexOf('&') > -1 ? hash.indexOf('&') : hash.length;
    let key = hash.substring(0, endKey);
    let value = hash.substring(endKey + 1, endValue);
    hashObject.set(key, value);
    hash = hash.slice(endValue + 1, hash.length);
  }
  return hashObject;
}

export function sendMessagePushNotification(
  msgId: string,
  userId: number,
  title: string,
  content: string,
  template: string,
  isSave: boolean,
  type: FirebaseType,
  condition: string,
  token: string
) {
  const objectMapper: ObjectMapper = new ObjectMapper();
  let notificationMessage: NotificationMessage = new NotificationMessage();
  notificationMessage.setMethod(MethodEnum.FIREBASE);
  let firebaseConfiguration: FirebaseConfiguration = new FirebaseConfiguration();
  firebaseConfiguration.setType(type);
  firebaseConfiguration.setToken(token);
  firebaseConfiguration.setCondition(condition);
  firebaseConfiguration.setNotification({
    title: title,
  });
  firebaseConfiguration.setData({ click_action: 'FLUTTER_NOTIFICATION_CLICK' });
  let data: string = content;
  let templateMap: Map<string, Object> = new Map<string, Object>([[template, data]]);
  notificationMessage.setConfiguration(firebaseConfiguration, objectMapper);
  notificationMessage.setTemplate(templateMap);

  Kafka.getInstance().sendMessage(msgId.toString(), config.topic.notification, '', notificationMessage);
}

export function validHash(hash: string, type: string) {
  let hashObject: string = aesDecrypt(hash);
  let mapHashObject: Map<any, any> = convertToHashObject(hashObject);
  if (
    mapHashObject.get('type').localeCompare(type) != 0 ||
    mapHashObject.get('key').localeCompare(config.key.aes.keyHash) != 0 ||
    moment().isBefore(moment(Number(mapHashObject.get('timeStamp'))))
  ) {
    throw new Errors.GeneralError('INVALID_HASH');
  }
  Logger.info('test check point', mapHashObject);
  if (
    moment.duration(moment().diff(moment(Number(mapHashObject.get('timeStamp'))))).asMilliseconds() <
    config.app.timeStampHash
  ) {
    throw new Errors.GeneralError('TO_FAST');
  }
}