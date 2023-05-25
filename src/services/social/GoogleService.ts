import axios, { AxiosRequestConfig } from 'axios';
import { Errors, Logger } from 'common';
import { Service } from 'typedi';
import config from '../../Config';
import Constants from '../../Constants';
import { JsonParser } from 'jackson-js';
import GoogleResponse from '../../models/response/GoogleResponse';

@Service()
export default class GoogleService {
  public async queryGoogleInfo(socialToken: string, transactionId: string | number) {
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
      const { data, status } = await api.get(`${config.google.infoUrl}${socialToken}`, {
        headers: {
          Accept: 'application/json',
        },
      });
      if (status != 200 || data.statusText != 'OK') {
        throw new Error(Constants.INVALID_SOCIAL_TOKEN);
      }
      let googleResponse: GoogleResponse = jsonParser.transform(data, {
        mainCreator: () => [GoogleResponse],
      });
      googleResponse.setProfileUrl(config.google.profileUrl.replace('{id}', googleResponse.getId()));
      return googleResponse;
    } catch (error) {
      Logger.error(transactionId, 'response error', error);
      throw new Errors.GeneralError();
    }
  }
}
