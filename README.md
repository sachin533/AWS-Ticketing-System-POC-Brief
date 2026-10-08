# AWS Serverless Ticketing System

Vue 3 + Vite + Tailwind frontend, Node.js 20 Lambda backend, API Gateway HTTP API,
DynamoDB, Cognito (Hosted UI), S3 attachments via pre-signed URLs.

> Status: **code complete, NOT deployed.** No AWS resources have been created.
> Nothing here needs AWS credentials to run/build locally.

## Project structure

```
frontend/                 Vue 3 + Vite + Tailwind SPA
  src/
    main.js               App entry
    App.vue               Navbar + <router-view/>
    router/index.js       Protected routes + auth guard
    services/auth.js      Cognito Hosted UI (PKCE), token storage, role decode
    services/api.js       fetch wrapper (adds Bearer ID token) + S3 PUT helper
    views/                Login, Callback, Dashboard, CreateTicket, TicketDetail
backend/                  Node.js 20 Lambda (single-function router, Free-Tier sized)
  src/
    index.js              Handler: routes 7 endpoints, role checks, DynamoDB + S3
    lib/dynamo.js         DocumentClient + table env vars
    lib/s3.js             Pre-signed PUT/GET URLs
    lib/auth.js           JWT claims -> { userId, email, role }
    lib/response.js       CORS + JSON helpers
    lib/validation.js     Input validation
  template.yaml           SAM: tables, bucket, User Pool, HTTP API + JWT authorizer, Lambda
  .env.example            Lambda env var names
README.md                 (this file)
```

## Architecture

```
 Browser (Vue SPA :5173)
   |  1. Hosted UI sign-in (OAuth2 code + PKCE) -> tokens in localStorage
   |  2. API calls with  Authorization: Bearer <Cognito ID token>
   v
 API Gateway HTTP API (JWT authorizer: issuer = Cognito User Pool, audience = web client)
   |  verified claims -> event.requestContext.authorizer.jwt.claims
   v
 Lambda (nodejs20.x, 256 MB)  -- src/index.js
   |-- DynamoDB Tickets        (PK ticketId)            create/list/get/update
   |-- DynamoDB TicketComments (PK ticketId, SK commentId)  add/list comments
   |-- S3 attachments bucket   (private; PUT+GET via presigned URLs only)
```

Roles come from the Cognito **`cognito:groups`** claim: `Agents` group = Agent, everyone else = Customer.
Enforced in **two** places: Vue router guards (UX) and Lambda `getCaller`/`requireAgent` + ownership checks (security).

## How each frontend call connects to AWS

| Frontend (`services/api.js`) | HTTP | Lambda (`src/index.js`) | AWS services touched |
|---|---|---|---|
| `api.createTicket()` | `POST /tickets` | `createTicket` — validates, `PutCommand` to Tickets | DynamoDB Tickets |
| `api.listTickets({status,priority,search})` | `GET /tickets?...` | `listTickets` — `Scan` (demo scale), then filters: ownership + status + priority + search | DynamoDB Tickets |
| `api.getTicket(id)` | `GET /tickets/{id}` | `getTicket` — `GetCommand` + `createDownloadUrl` per attachment | DynamoDB + S3 (GET presign) |
| `api.updateTicket(id, {status,assignee,…})` | `PUT /tickets/{id}` | `updateTicket` — customers blocked from status/assignee; `UpdateCommand` | DynamoDB Tickets |
| `api.addComment(id, msg)` | `POST /tickets/{id}/comments` | `addComment` — `PutCommand` to Comments | DynamoDB Comments |
| `api.listComments(id)` | `GET /tickets/{id}/comments` | `listComments` — `QueryCommand` by ticketId | DynamoDB Comments |
| `api.presignedUrl()` then `api.uploadToS3()` | `POST /tickets/presigned-url` then `PUT <s3-url>` | `presignedUrl` — `getSignedUrl(PutObjectCommand)`; browser uploads bytes **directly to S3** (never through Lambda) | S3 |

Auth plumbing: `services/auth.js:login()` -> `https://<domain>/oauth2/authorize` ->
`/callback` -> `handleCallback()` exchanges code at `/oauth2/token` ->
`api.js:req()` attaches `Authorization: Bearer <id_token>` ->
API Gateway JWT authorizer validates -> Lambda `lib/auth.js:getCaller()` reads groups/email/sub.

## AWS resources to create LATER (do not create yet)

Easiest path: `sam build && sam deploy --guided` in `backend/` (uses `template.yaml`).
It creates, all Free-Tier-friendly (DynamoDB on-demand, Lambda 256 MB, private S3):

1. **DynamoDB** `tickets-<stage>` (PK `ticketId`) + `ticket-comments-<stage>` (PK `ticketId`, SK `commentId`), on-demand billing.
2. **S3** `ticket-attachments-<stage>-<account>` — private, block-all-public, presigned-URL access only.
3. **Cognito User Pool** (email login) + `Agents` + `Customers` groups + Hosted UI domain + public SPA client (code flow, no secret, `email openid profile` scopes).
4. **Lambda** `ticketing-api-<stage>` (nodejs20.x) with env vars below + least-privilege DynamoDB/S3 policies.
5. **API Gateway HTTP API** with `JwtAuthorizer` (issuer = User Pool, audience = web client) on all 7 routes + CORS for the frontend origin.

Manual-console equivalent: create the same 5 items in the same order; callback/logout URLs must match `VITE_COGNITO_REDIRECT_URI` / `..._LOGOUT_URI`.

### After deploy: wire the frontend

```bash
cp frontend/.env.example frontend/.env   # fill from `sam deploy` outputs:
# VITE_API_BASE_URL      <- ApiBaseUrl output
# VITE_COGNITO_DOMAIN    <- CognitoDomain output
# VITE_COGNITO_CLIENT_ID <- UserPoolClientId output
npm run dev --prefix frontend
```

Create users in the User Pool (Hosted UI sign-up), then add support staff to the **`Agents`** group
(Cognito console -> User Pool -> Groups -> Agents -> Add user). Everyone else is a Customer by default.

## Environment variables (no secrets hard-coded)

Lambda (`backend/.env.example`): `AWS_REGION, TICKETS_TABLE, COMMENTS_TABLE, ATTACHMENTS_BUCKET, CORS_ORIGIN, PRESIGNED_URL_EXPIRES_IN, ALLOWED_MIME_TYPES, MAX_ATTACHMENT_BYTES`.
Frontend (`frontend/.env.example`): `VITE_API_BASE_URL, VITE_COGNITO_DOMAIN, VITE_COGNITO_CLIENT_ID, VITE_COGNITO_REDIRECT_URI, VITE_COGNITO_LOGOUT_URI, VITE_COGNITO_REGION`.
Real values come from `sam deploy` outputs — never commit `.env`.

## Local verification (no AWS needed)

- Backend syntax + router smoke test passed (`node --check`, 404/401/validation checks).
- Frontend production build passed (`npm run build` -> `frontend/dist/`).
- No credentials, no deploys, no AWS resources touched.

## Free-Tier notes

DynamoDB on-demand + 25 GB free, Lambda 1M req/mo free, S3 5 GB free, Cognito 50k MAU free, API Gateway HTTP API 1M req/mo free (12-mo). Scan-based listing is fine for demo scale; at scale add a GSI and `Query` it (noted in `listTickets`).
