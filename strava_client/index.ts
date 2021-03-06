// tslint:disable
/**
 * Strava API v3
 * The [Swagger Playground](https://developers.strava.com/playground) is the easiest way to familiarize yourself with the Strava API by submitting HTTP requests and observing the responses before you write any client code. It will show what a response will look like with different endpoints depending on the authorization scope you receive from your athletes. To use the Playground, go to https://www.strava.com/settings/api and change your “Authorization Callback Domain” to developers.strava.com. Please note, we only support Swagger 2.0. There is a known issue where you can only select one scope at a time. For more information, please check the section “client code” at https://developers.strava.com/docs.
 *
 * The version of the OpenAPI document: 3.0.0
 *
 *
 * NOTE: This class is auto generated by OpenAPI Generator (https://openapi-generator.tech).
 * https://openapi-generator.tech
 * Do not edit the class manually.
 */

import axios from "axios";
import { ActivitiesApiFactory, StreamsApiFactory } from "./api";

export * from "./api";
export * from "./configuration";

const axios_instance = axios.create({});
axios_instance.interceptors.response.use(undefined, (err) => {
  if (err?.response?.status === 401) {
    window.location.replace(
      "/?" + new URLSearchParams(JSON.parse(localStorage.props)).toString()
    );
    return;
  }
  return Promise.reject(err);
});

export function stravaClient() {
  const config = {
    accessToken: JSON.parse(localStorage.props).access_token,
  };
  return {
    activities: ActivitiesApiFactory(config, undefined, axios_instance),
    streams: StreamsApiFactory(config, undefined, axios_instance),
  };
}
