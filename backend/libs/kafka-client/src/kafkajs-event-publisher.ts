import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer } from 'kafkajs';
import type { IEventPublisher } from './event-publisher.interface';

// Raw kafkajs Producer, not @nestjs/microservices' ClientKafka (built around request/response
// reply topics, which fire-and-forget `emit` has no use for). `clientId` is a constructor
// parameter so every service can share this class while identifying itself distinctly — each
// service's module supplies its own name via a `useFactory` binding.
@Injectable()
export class KafkajsEventPublisher
  implements IEventPublisher, OnModuleInit, OnModuleDestroy
{
  private readonly kafka: Kafka;
  private readonly producer: Producer;

  constructor(config: ConfigService, clientId: string) {
    const brokers =
      // container-network default; override via env for local `npx nest start`
      (config.get<string>('KAFKA_BROKERS') ?? 'kafka:19092').split(',');
    this.kafka = new Kafka({ clientId, brokers });
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
