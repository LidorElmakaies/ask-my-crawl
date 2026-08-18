# Backend Architecture — Clean/Hexagonal Layering

Every NestJS service in `services.md` (Gateway, Auth, Crawl Worker, Search Result Manager,
Query/Answer, Notification, Crawl Result Manager) follows the same internal 3-layer structure. The
dependency rule is one-directional: **API → Application → Infrastructure**, and at every boundary
the caller depends on an **interface**, never a concrete class. This is what makes "swap Postgres
for Mongo" or "swap salt+pepper+SHA-256 for plain SHA-256" a new-adapter-plus-one-DI-binding change,
not a rewrite.

## The three layers

**API layer** — every way the outside world talks to this service: HTTP controllers, middlewares,
Kafka **consumers** (`@EventPattern`/`@MessagePattern` handlers — inbound only), WebSocket gateways.
This layer does **no business logic** — it validates/deserializes input, calls exactly one
Application-layer service **through its interface**, and serializes the result back out. If you're
writing an `if` statement that decides something about *the domain* (not about HTTP status codes or
message routing), it's in the wrong layer.

**Application layer** — the actual use-case logic (e.g. "register a user," "claim and process a
crawl URL," "answer a job's query"). Each use case is a service class that **implements an
interface of its own** (so the API layer depends on that interface, not the concrete service). It
in turn depends only on interfaces the Infrastructure layer implements — a repository, a password
hasher, an embeddings client, an LLM client, an event publisher, a notification sender. It never
imports `pg`, `kafkajs`, a specific ORM, or any concrete Infrastructure class directly.

**Infrastructure layer** — concrete implementations of the interfaces the Application layer depends
on: Postgres repositories, the salt+pepper+SHA-256 hasher, **Kafka producers**, the LangChain
embedding client, the email/SMS/Telegram senders. This is the only layer allowed to know about
specific libraries and external systems.

> **Kafka producers are Infrastructure, not API.** A consumer (`@EventPattern`) is an inbound
> trigger, so it's an API-layer adapter — but *publishing* a message is an outbound side effect,
> exactly like calling Postgres or an external API, so it's an Infrastructure adapter behind an
> interface the Application layer defines a dependency on (e.g. `IEventPublisher`). Never call
> `kafkaClient.emit(...)` directly from Application or API code.

## Folder structure — each layer owns an `interfaces/` subfolder for what *it* implements

```
src/
  models/                             # domain layer — see below. No framework imports, ever.
    user.ts                          # User, PublicUser, UserRole, toPublicUser()
    refresh-token.ts                 # RefreshToken
  auth/
    api/
      auth.controller.ts             # depends on IAuthService, not AuthService
      dto/
        register-request.dto.ts      # shape of what the FRONTEND sends this endpoint —
                                      # Gateway-only, lives here, not in a shared lib (see DTOs below)
    application/
      auth.service.ts                # class AuthService implements IAuthService
      interfaces/
        auth-service.interface.ts    # IAuthService — implemented by AuthService,
                                      # consumed by the API layer
    infrastructure/
      interfaces/
        user-repository.interface.ts     # IUserRepository — implemented by PostgresUserRepository,
                                          # consumed by the Application layer
        password-hasher.interface.ts     # IPasswordHasher — implemented by SaltPepperSha256Hasher
      postgres/
        postgres-user.repository.ts      # implements IUserRepository
      hashing/
        salt-pepper-sha256.hasher.ts     # implements IPasswordHasher, per auth.md's formula
    auth.module.ts                   # binds every token: AUTH_SERVICE, USER_REPOSITORY, PASSWORD_HASHER
```

Rule of thumb: **an interface lives in the `interfaces/` folder of the layer whose class implements
it**, not the layer that merely consumes it. `application/interfaces/` holds interfaces Application
classes implement (consumed by API). `infrastructure/interfaces/` holds interfaces Infrastructure
classes implement (consumed by Application). File naming: `<thing>.interface.ts`, exporting
`I<Thing>` (e.g. `IUserRepository`).

**Domain models are not interfaces — don't put them in an `interfaces/` folder.** `User`,
`RefreshToken`, and anything else that's just "what a thing looks like" (no methods, nothing to
implement) live in a top-level `models/` folder instead, sibling to `api/`/`application/`/
`infrastructure/`. Rule: if it's an `I<Thing>` some class `implements`, it belongs in whichever
layer's `interfaces/` that class lives in; if it's a plain data shape, it belongs in `models/`.
`models/` has zero dependencies on any other layer (no framework imports — not even NestJS
decorators) — every other layer is free to import from it. A pure transform over a model that
introduces no framework/infra dependency (e.g. `toPublicUser()`) lives alongside the model it
transforms, not in `application/`.

**Not every plain data shape is a domain model, though.** A use-case's request/response types
(`RegisterInput`, `LoginInput`, `AuthTokens`, `AuthResult` in `auth-service.interface.ts`) are also
plain shapes with no methods — but they stay declared right alongside the `I<Thing>Service`
interface that uses them, not in `models/`. The test is **scope of reuse**, not "is it a plain
object": a domain model (`User`) has a life outside any single operation — repositories, multiple
services, API responses all reference it independently. A use-case I/O shape (`RegisterInput`)
means nothing outside the one method it's the parameter/return type for. If a "local" shape like
that starts getting imported from somewhere unrelated to its owning interface, that's the signal it
was actually a domain model in disguise and belongs in `models/` after all.

`AuthService.register()` calls `this.passwordHasher.hash(password)` and
`this.userRepository.save(...)` — it has never heard of Postgres or SHA-256. Swapping either means
writing one new class in `infrastructure/` and changing one line in `auth.module.ts`'s `providers`
array; `auth.service.ts` and its tests don't change. Same for `auth.controller.ts` if `AuthService`
itself were ever swapped for an alternate implementation of `IAuthService`.

## NestJS wiring convention

Bind every interface to its implementation via an injection token, in every layer, not just at the
Application↔Infrastructure boundary:

```ts
export const AUTH_SERVICE = Symbol('IAuthService');
export const USER_REPOSITORY = Symbol('IUserRepository');
export const PASSWORD_HASHER = Symbol('IPasswordHasher');

@Module({
  controllers: [AuthController],
  providers: [
    { provide: AUTH_SERVICE, useClass: AuthService },
    { provide: USER_REPOSITORY, useClass: PostgresUserRepository },
    { provide: PASSWORD_HASHER, useClass: SaltPepperSha256Hasher },
  ],
})
export class AuthModule {}
```

- `AuthController` requests `@Inject(AUTH_SERVICE) private authService: IAuthService`.
- `AuthService` requests `@Inject(USER_REPOSITORY)` / `@Inject(PASSWORD_HASHER)`, typed as the
  interfaces — never the concrete classes by name.

## DTOs

**Implemented** — `backend/libs/dtos` (`@app/dtos`), containing the Auth request DTOs
(`RegisterDto`, `LoginDto`, `RefreshTokenDto`, `UpdateMeDto`, `UpdateUserAdminDto`) and the
`UserResponseDto` wire shape.

- **The test for "shared lib vs. local `api/dto/`" is not "does the frontend send this" — it's
  "does more than one service's code need to agree on this exact shape."** Auth Service's
  controllers implement the `api-contracts.md` paths directly (per `services.md`'s "Gateway is a
  thin proxy" decision) — once the Gateway proxy exists, it forwards/relays the *same* request and
  response bodies Auth Service already validates and returns. Two services caring about one shape
  is exactly the case a shared lib exists for: put it in `backend/libs/dtos/`, both sides import
  the same type, and changing the shape in one place is a compile error everywhere it's used until
  fixed everywhere.
- **A DTO stays local to `apps/<service>/src/.../api/dto/`** only when no other service's code
  will ever reference the same shape — e.g. a service's own internal request-building types that
  never cross a boundary another service inspects.
- **Response *mappers* (the function that builds a DTO from a domain model) stay local to the
  owning service**, even when the DTO type they return is shared — only the service that owns the
  domain model (`PublicUser`, in Auth Service's case) knows how to map it. `apps/auth/src/api/dto/
  user-response.ts`'s `toUserResponse()` is the pattern to copy: it imports `UserResponseDto`'s
  *type* from `@app/dtos` but the mapping function itself isn't in the shared lib.
- A DTO that references `UserRole` imports it from `@app/auth-kernel` (see `auth-kernel`'s own
  entry above) — not from any one service's `models/`, since role is baked into the JWT itself and
  every app handling tokens needs the same type.
- Kafka event payloads are a separate concern, already covered by `backend/libs/kafka-contracts`
  (see `backend/AGENTS.md` / the `backend` agent definition) — don't duplicate those as DTOs.

## Applies beyond HTTP services too

Kafka consumers and WebSocket gateways are still "API layer" — a Crawl Worker's
`@EventPattern('crawl-frontier')` handler does input parsing and calls into the Application layer's
crawl use case (through its interface); it does not itself touch Redis, Postgres, the fetch client,
or Kafka producers. Those are all Infrastructure adapters (`RedisVisitedSetAdapter`,
`PostgresPageRepository`, `HttpPageFetcher`, `KafkaCrawlFrontierProducer`, ...) behind interfaces
the Application layer depends on (`IVisitedSet`, `IPageRepository`, `IPageFetcher`,
`IEventPublisher`) — all declared in that service's `infrastructure/interfaces/`.

## Why this matters for testing

See the `testing` agent (`.claude/agents/testing.md`) — this layering is what makes the test
pyramid possible: Application-layer unit tests mock the interfaces (no real DB/Kafka, fast, most of
the suite), Infrastructure adapters get integration tests against the real dependency, and API layer
gets thin e2e/contract tests.
