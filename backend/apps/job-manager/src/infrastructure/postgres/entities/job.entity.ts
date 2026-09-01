import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

// Mirrors data-model.md's `jobs` table exactly — no FK relation object for user_id, just the raw
// column: `users` isn't this service's table, and cross-service data ownership is never crossed
// via a TypeORM relation, only via that service's own API/events (see backend-architecture.md).
@Entity({ name: 'jobs' })
export class JobEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  user_id: string;

  @Column({ type: 'text' })
  url: string;

  @Column({ type: 'text' })
  query: string;

  // NULL until Query/Answer's answer comes back (answer-ready) — the only "not done yet" signal,
  // no separate status column (see data-model.md).
  @Column({ type: 'text', nullable: true, default: null })
  result: string | null;

  @Column({
    name: 'failed_reason',
    type: 'text',
    nullable: true,
    default: null,
  })
  failed_reason: string | null;
}
