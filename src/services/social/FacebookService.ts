import axios, { AxiosRequestConfig } from 'axios';
import { Errors, Logger } from 'common';
import { Service } from 'typedi';
import config from '../../Config';
import Constants from '../../Constants';
import { JsonParser } from 'jackson-js';
import FacebookResponse from '../../models/response/FacebookResponse';

@Service()
export default class FacebookService {
  public async queryFacebookInfo(socialToken: string, transactionId: string | number) {
    const api = axios.create();
    const jsonParser = new JsonParser();
    api.interceptors.request.use(
      (config: AxiosRequestConfig) => {
        Logger.info(`${transactionId} request ${config.method?.toUpperCase()} ${config.url}`);
        Logger.info(`${transactionId} request headers ${config.headers} data ${config.data}`);
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    api.interceptors.response.use(
      (response) => {
        Logger.info(`${transactionId} response ${response}`);
        return response;
      },
      (error) => {
        return Promise.reject(error);
      }
    );
    try {
      const { data, status } = await api.get(`${config.facebook.infoUrl}${socialToken}`, {
        headers: {
          Accept: 'application/json',
        },
      });
      if (status != 200 || data.statusText != 'OK') {
        throw new Error(Constants.INVALID_SOCIAL_TOKEN);
      }
      let facebookResponse: FacebookResponse = jsonParser.transform(data, {
        mainCreator: () => [FacebookResponse],
      });
      facebookResponse.setProfileUrl(config.facebook.profileUrl.replace('{id}', facebookResponse.getId()));
      facebookResponse.setAvatar(config.facebook.avatarUrl.replace('{id}', facebookResponse.getId()));
      return facebookResponse;
    } catch (error) {
      Logger.error(transactionId, 'response error', error);
      throw new Errors.GeneralError();
    }
  }
}
