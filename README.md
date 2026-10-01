# Legal Agent

Legal Agent is a full-stack AI legal research assistant that helps users research legal questions, upload and search their own documents, organize research into cases, save conversations, and view legal news updates.

It uses Retrieval-Augmented Generation (RAG) to retrieve relevant content from uploaded documents and provide context-aware AI responses.

> Legal Agent is an AI research assistant and is not a substitute for professional legal advice or verification of current primary legal sources.

## Live Demo

https://legal-agent-3unltysa4-shubham-yadavs-projects-559bea27.vercel.app/

## Features

* User registration and login
* JWT-based authentication
* AI-powered legal question answering
* RAG-based document search
* PDF and TXT document uploads
* Semantic search using Qdrant
* Case management
* Conversation history
* Streaming AI responses
* Document source references
* Legal news feed
* User profile management

## Tech Stack

| Component         | Technology              |
| ----------------- | ----------------------- |
| Frontend          | React, TypeScript, Vite |
| Backend           | Python, FastAPI         |
| Database          | PostgreSQL              |
| Vector Database   | Qdrant                  |
| AI                | Gemini / OpenAI         |
| Authentication    | JWT                     |
| Password Hashing  | bcrypt                  |
| Containerization  | Docker                  |
| Production Server | Caddy                   |

## How It Works

The main application flow is:

```text
React Frontend
      |
      v
FastAPI Backend
      |
      +-------------------+
      |                   |
      v                   v
 PostgreSQL             Qdrant
      |                   |
      |             Document Search
      |                   |
      +---------+---------+
                |
                v
           AI Model
                |
                v
        Streaming Response
```

## RAG Pipeline

When a user uploads a document:

```text
PDF / TXT
   |
   v
Text Extraction
   |
   v
Text Chunking
   |
   v
Embeddings
   |
   v
Qdrant
```

When a user asks a question:

```text
User Question
      |
      v
Qdrant Search
      |
      v
Relevant Document Chunks
      |
      v
AI Model
      |
      v
Generated Answer
```

The retrieved documents are filtered using the user's information and, when applicable, the selected case.

## Document Storage

The application uses three types of storage:

### PostgreSQL

Stores:

* Users
* Cases
* Document metadata
* Conversations
* Messages
* Profiles

### Qdrant

Stores:

* Document embeddings
* Document chunks
* Document metadata
* Search information

### File Storage

Stores the original uploaded PDF and TXT files.

A complete backup therefore requires PostgreSQL, Qdrant, and the uploaded files.

## Legal News

The application includes a separate legal-news section.

It collects information from selected RSS feeds and Nepalese official websites.

The news feed is separate from the AI chat. News articles are not automatically used as context when answering chat questions.

The news system depends on the availability and structure of external websites, so it cannot guarantee that every legal update is captured.

## Project Structure

```text
legal-agent/
|
├── backend/
│   └── app/
│       ├── main.py
│       ├── core.py
│       ├── db.py
│       ├── rag.py
│       ├── news.py
│       └── ...
|
├── frontend/
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── Auth.tsx
│       ├── Profile.tsx
│       ├── api.ts
│       └── ...
|
├── data/
├── docker-compose.yml
├── docker-compose.production.yml
├── Caddyfile
├── .env.example
├── .env.production.example
└── README.md
```

## Running Locally

Clone the repository:

```bash
git clone <your-repository-url>
cd legal-agent
```

Create the environment file:

```bash
cp .env.example .env
```

Configure the required environment variables.

Start the development environment:

```bash
docker compose up --build
```

The development stack includes the frontend, FastAPI backend, PostgreSQL, and Qdrant.

## Deployment

The project includes production configuration using Docker Compose and Caddy.

Production files include:

```text
docker-compose.production.yml
Caddyfile
frontend/Dockerfile
.env.production.example
```

The production architecture is designed to serve the frontend and backend through the same domain, with `/api` routed to the FastAPI backend.

## Current Limitations

* Only PDF and TXT files are supported.
* Scanned PDFs are not supported because OCR is not implemented.
* The default document upload limit is 25 MB.
* Document retrieval may miss relevant passages.
* AI-generated answers may contain errors.
* The news feed cannot guarantee complete coverage of all legal updates.
* News content is not automatically used by the chat system.
* There is currently no email verification.
* There is currently no password reset system.
* Two-factor authentication is not implemented.
* Database migrations are not currently implemented.
* Important legal information should be verified against authoritative sources.

## Future Improvements

Planned improvements include:

* OCR for scanned documents
* Hybrid keyword and vector search
* Reranking for better retrieval
* Better document citations
* Integration with more official legal sources
* Legal document comparison
* Law and amendment tracking
* Case-specific notifications
* Email notifications
* Two-factor authentication
* Role-based access control
* Automated backups
* CI/CD
* Improved testing and monitoring

## Disclaimer

Legal Agent is intended for research and informational purposes.

It does not provide legal representation or constitute legal advice. Users should verify important information against current and authoritative legal sources.

## Author

Shubham Yadav

Computer Science | AI & Data Engineering
