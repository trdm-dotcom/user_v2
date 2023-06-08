import { Kafka } from 'kafka-common';
import config from '../Config';

var instance: Kafka.KafkaRequestSender;

function initKafka() {
  instance = new Kafka.KafkaRequestSender(config, true, null);
}

function getInstance() {
  return instance;
}

export { getInstance, initKafka };
