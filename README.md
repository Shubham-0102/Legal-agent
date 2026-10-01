# Legal Agent

## Run
Copy `.env.example` to `.env`, set a long random `JWT_SECRET`, and add a Gemini API key to `GEMINI_API_KEY`. Create a key in [Google AI Studio](https://aistudio.google.com/apikey). Do not commit `.env` or share the key.

```sh
docker compose up --build
```

The frontend is at http://localhost:5173 and the backend API docs are at http://localhost:8000/docs. The API root (`http://localhost:8000/`) intentionally has no homepage and returns 404.

The default Gemini configuration uses `gemini-3.5-flash` for chat and `gemini-embedding-001` for retrieval embeddings. Gemini free-tier availability and request limits depend on account, region, and current Google AI Studio terms. To use OpenAI instead, set `AI_PROVIDER=openai`, `OPENAI_API_KEY`, `CHAT_MODEL=gpt-4o`, and `EMBED_MODEL=text-embedding-3-small`.

For frontend-only development on the host, use `npm --prefix frontend run dev -- --host`; there is no root-level `package.json`.

## Research flow
Register and log in, then ask general legal research questions without uploading a document. Include the jurisdiction and relevant date; the assistant gives preliminary research guidance and flags that current primary authority must be checked. Upload a PDF or TXT when you want an answer grounded in a specific record. Every Qdrant query is filtered by `user_id` and, when selected, `case_id`.

## Frontend
`docker compose up --build` also starts the React app (first start runs `npm install`).


## Production deployment on a VPS

The regular `docker-compose.yml` is for local development: it runs Vite's dev server and publishes the frontend and API directly. For a public deployment, use the production stack below. It builds static frontend assets and lets Caddy serve the frontend and proxy `/api` over HTTPS on one domain. The database, Qdrant, API, and uploaded files stay on the private Docker network or persistent volumes.

1. Provision a Linux VPS with Docker Engine and the Docker Compose plugin. Point your domain's DNS `A` record to the VPS IPv4 address. Open inbound TCP ports 80 and 443 (and UDP 443 if you want HTTP/3); restrict SSH to your own IP where possible. Do not open ports 5173, 8000, 5432, or 6333.
2. Clone this repository onto the VPS and enter its directory.
3. Create the production environment file and edit it:

   ```sh
   cp .env.production.example .env.production
   ```

   Set `APP_DOMAIN` and `CORS_ORIGINS` to your real domain. Set `POSTGRES_PASSWORD` and `JWT_SECRET` to separate random values, for example the output of `openssl rand -hex 32`. Copy the exact `POSTGRES_PASSWORD` value into the password part of `DATABASE_URL`. Add the API key for your selected provider. Keep `.env.production` private and never commit it.
4. Start the production stack:

   ```sh
   chmod 600 .env.production
   docker compose --env-file .env.production -f docker-compose.production.yml up -d --build
   ```

5. Check startup logs if needed, then open `https://your-domain`. Caddy obtains and renews HTTPS certificates automatically once DNS points to the server and ports 80/443 reach it.

Update after pulling new code with the same `docker compose ... up -d --build` command. The database, Qdrant index, uploads, and Caddy certificates are stored in Docker volumes; configure regular off-server backups for all user data before relying on the deployment. The app currently allows account registration, so anyone who can reach the site can create an account.

This is a single-server deployment path, not a high-availability setup. The API currently creates missing database tables on startup; it does not run schema migrations. Plan and test migrations before deploying schema changes to an installation that contains important data.


## Current information in chat

For detected current-fact questions (such as current office holders, recent developments, or current law), the Gemini configuration uses Gemini Google Search grounding and displays the returned source links in the answer. To protect document privacy, this path sends only the latest question to Gemini; it skips document retrieval and does not send prior chat messages or uploaded-document passages. If the search request fails or returns no source links, the app reports that it could not verify the current answer instead of falling back to the model's remembered answer. This live-search path requires `AI_PROVIDER=gemini`; the OpenAI chat-completions path does not currently provide live search. Google Search grounding has separate quota and billing rules; check the current Gemini pricing and availability for your account.
