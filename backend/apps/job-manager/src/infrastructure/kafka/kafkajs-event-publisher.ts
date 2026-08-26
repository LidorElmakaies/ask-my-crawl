import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer } from 'kafkajs';
import type { IEventPublisher } from '../interfaces/event-publisher.interface';

// Raw kafkajs Producer, not @nestjs/microservices' ClientKafka — ClientKafka is built around
// request/response reply topics, which fire-and-forget `emit` here has no use for. See
// backend-architecture.md's "Kafka producers are Infrastructure, not API" rule: Application code
// only ever sees IEventPublisher, never kafkajs.
@Injectable()
export class KafkajsEventPublisher
  implements IEventPublisher, OnModuleInit, OnModuleDestroy
{
  private readonly kafka: Kafka;
  private readonly producer: Producer;

  constructor(config: ConfigService) {
    // Container-network default (service name, not localhost — see devops.md's non-negotiables).
    // Override via env for local (non-Docker) `npx nest start job-manager`. Same convention as
    // AuthServiceHttpClient's AUTH_SERVICE_URL / ToolProxyModule's GRAFANA_URL.
    const brokers = (
      config.get<string>('KAFKA_BROKERS') ?? 'kafka:19092'
    ).split(',');
    this.kafka = new Kafka({ clientId: 'job-manager', brokers });
    this.producer = this.kafka.producer();
  }

  async onModuleInit(): Promise<void> {
    await this.producer.connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.producer.disconnect();
  }

  async publish<T extends object>(
    topic: string,
    key: string,
    message: T,
  ): Promise<void> {
    await this.producer.send({
      topic,
      messages: [{ key, value: JSON.stringify(message) }],
    });
  }
}
