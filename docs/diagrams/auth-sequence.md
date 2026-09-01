# Auth — Register, Login, Token Refresh, Per-Request Verification

Every route here is proxied through the Gateway — the frontend never calls Auth Service directly,
even though it still listens on its own port (`8001`) for that one server-to-server hop. See
[docs/specs/full-spec.md §8](../specs/full-spec.md) for the exact hashing formula and token TTLs.

## Register + login

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant FE as Frontend
    participant GW as Gateway
    participant Auth as Auth Service
    participant PG as Postgres

    User->>FE: fill email/password, submit
    FE->>GW: POST /auth/register (or /auth/login)
    GW->>Auth: relay verbatim (thin proxy, no translation)

    alt register
        Auth->>Auth: generate password_salt
        Auth->>Auth: hash = SHA256(PEPPER + salt + password)
        Auth->>PG: INSERT users (email lowercased, hash, salt, role='user')
    else login
        Auth->>PG: SELECT user by lowercased email
        Auth->>Auth: recompute SHA256(PEPPER + stored salt + password), compare
    end

    Auth->>Auth: sign access_token (JWT, 15 min, {sub, role})
    Auth->>Auth: generate refresh_token (random 32 bytes)
    Auth->>PG: INSERT refresh_tokens (SHA256(refresh_token) only)
    Auth-->>GW: { user, access_token, refresh_token }
    GW-->>FE: relay verbatim
    FE-->>User: logged in, tokens stored in Redux (never rendered/edited)
```

## Every subsequent request — local verification, no Auth Service round-trip

```mermaid
sequenceDiagram
    autonumber
    participant FE as Frontend
    participant GW as Gateway
    participant Auth as Auth Service

    FE->>GW: any request, Authorization: Bearer <access_token>
    GW->>GW: verify JWT signature + expiry locally (@app/auth-kernel)

    alt token valid, role sufficient
        GW->>GW: handle request (or relay to Job Manager / Auth Service internally)
        GW-->>FE: 200/202/etc.
    else token invalid, expired, or wrong role
        GW-->>FE: 401 (or 403 for a wrong-role admin route)
        FE->>GW: POST /auth/refresh { refresh_token }
        GW->>Auth: relay
        Auth->>Auth: look up hash, check not expired/revoked
        Auth->>Auth: revoke old refresh_token row, issue new pair (rotation)
        Auth-->>GW: { access_token, refresh_token }
        GW-->>FE: relay — frontend retries the original request
    end
```

Note: the Gateway's own `JwtAuthGuard`/`RolesGuard` reject an invalid token or insufficient role
**before** any call reaches Auth Service for an Auth-Service-bound route (`/me`, `/admin/users*`) —
Auth Service then re-verifies independently on its own side too (defense in depth, not redundant).
