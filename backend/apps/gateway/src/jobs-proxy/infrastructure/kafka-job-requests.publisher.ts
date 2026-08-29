import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  KAFKA_TOPICS,
  type JobRequestsMessage,
} from '@app/kafka-contracts';
import { Kafka, Producer } from 'kafkajs';
import type { IJobRequestsPublisher } from './interfaces/job-requests-publisher.interface';

@Injectable()
export class KafkaJobRequestsPublisher
  implements IJobRequestsPublisher, OnModuleInit, OnModuleDestroy
{
  private readonly kafka: Kafka;
  private readonly producer: Producer;

  constructor(config: ConfigService) {
    const brokers = (
      config.get<string>('KAFKA_BROKERS') ?? 'kafka:19092'
    ).split(',');
    this.kafka = new Kafka({ clientId: 'gateway', brokers });
    this.producer = this.kafka.producer();
  }

  async onModuleInit(): Promise<void> {
    await this.producer.connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.producer.disconnect();
  }

  async publish(message: JobRequestsMessage): Promise<void> {
    await this.producer.send({
      topic: KAFKA_TOPICS.JOB_REQUESTS,
      messages: [{ key: message.user_id, value: JSON.stringify(message) }],
    });
  }
}
