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
