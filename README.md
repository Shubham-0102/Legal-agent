# Legal Agent

Legal Agent is an AI-powered legal research and document analysis web application designed to help users research legal information, ask questions, and interact with their legal documents through an AI-powered chatbot.

The system combines Retrieval-Augmented Generation (RAG), vector search, document processing, and live web search to provide contextual responses for legal research.

## Live Demo

[Legal Agent](https://legal-agent-3unltysa4-shubham-yadavs-projects-559bea27.vercel.app/)

## GitHub Repository

[GitHub Repository](https://github.com/Shubham-0102/Legal-agent)

## Features

* AI-powered legal question answering
* Retrieval-Augmented Generation (RAG)
* Legal document upload and analysis
* Ask questions about uploaded documents
* Vector search using Qdrant Cloud
* Live search for current information
* English and Nepali language support
* User registration and login
* JWT-based authentication
* Conversation history
* User profile management
* Legal case management
* Document management
* Streaming AI responses
* PostgreSQL database for application data

## How It Works

The application follows this general workflow:

```text
User
  |
  v
Frontend
  |
  v
FastAPI Backend
  |
  +--------------------+
  |                    |
  v                    v
PostgreSQL          Qdrant Cloud
  |                    |
  |                    v
  |                Vector Search
  |                    |
  +---------+----------+
            |
            v
       AI Processing
            |
            +------------------+
            |                  |
            v                  v
        Local RAG         Live Search
            |                  |
            +--------+---------+
                     |
                     v
              Generated Answer
                     |
                     v
                  User
```

## RAG Pipeline

For uploaded legal documents, the system processes the documents and stores their vector representations in Qdrant.

When a user asks a question:

1. The question is received by the FastAPI backend.
2. Relevant document information is searched using vector similarity.
3. Retrieved information is added as context.
4. The AI model generates a response using the retrieved context.
5. The response is streamed back to the frontend.

This allows users to ask questions based on their uploaded legal documents instead of relying only on general model knowledge.

## Live Search

Legal information can change over time. The application therefore includes live search functionality for questions that require current information.

The live-search functionality can be used when information is not available in the local document knowledge base or when current information is required.

## Technology Stack

### Frontend

* React
* TypeScript
* Vite
* CSS

### Backend

* Python
* FastAPI
* SQLAlchemy
* PostgreSQL
* JWT Authentication

### AI and RAG

* Gemini API
* Qdrant Cloud
* Retrieval-Augmented Generation
* PDF processing

### Deployment

* Vercel — Frontend
* Render — Backend
* PostgreSQL — Database
* Qdrant Cloud — Vector Database

## Project Structure

```text
legal-agent/
├── backend/
│   ├── app/
│   │   ├── core.py
│   │   ├── db.py
│   │   ├── main.py
│   │   ├── news.py
│   │   └── rag.py
│   ├── Dockerfile
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── api.ts
│   │   ├── App.tsx
│   │   ├── Auth.tsx
│   │   ├── Profile.tsx
│   │   ├── main.tsx
│   │   └── styles.css
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── package.json
│   └── vite.config.ts
│
├── data/
├── docker-compose.yml
├── docker-compose.production.yml
├── Caddyfile
├── .env.example
├── .env.production.example
└── README.md
```

## Local Development

### Clone the repository

```bash
git clone https://github.com/Shubham-0102/Legal-agent.git
cd Legal-agent
```

### Backend Setup

Create and activate a virtual environment:

```bash
python3 -m venv .venv
source .venv/bin/activate
```

Install dependencies:

```bash
pip install -r backend/requirements.txt
```

Configure the environment variables in `.env`.

The application requires configuration for:

```text
DATABASE_URL
JWT_SECRET
GEMINI_API_KEY
QDRANT_URL
QDRANT_API_KEY
CORS_ORIGINS
```

Start the backend:

```bash
uvicorn backend.app.main:app --reload
```

### Frontend Setup

Open another terminal:

```bash
cd frontend
npm install
npm run dev
```

The frontend will normally be available at:

```text
http://localhost:5173
```

## Deployment

The current deployment uses:

```text
Frontend  → Vercel
Backend   → Render
Database  → PostgreSQL
Vectors   → Qdrant Cloud
AI        → Gemini API
```

Environment variables and API keys are stored in the deployment platforms rather than committed to the GitHub repository.

## Security

Sensitive credentials are not stored in the repository.

The project uses environment variables for:

* Database credentials
* JWT secret
* Gemini API key
* Qdrant API key
* CORS configuration

The `.env` file is excluded through `.gitignore`.

## Project Purpose

This project was developed as an academic project to explore the practical implementation of:

* Generative AI
* Retrieval-Augmented Generation
* Vector databases
* Legal document processing
* AI-powered search
* Full-stack web development
* API development
* Cloud deployment

## Limitations

Legal Agent is an academic project and should not be treated as a replacement for a qualified legal professional.

AI-generated responses may contain errors or incomplete information. Legal information should be verified against official legal sources and applicable laws before being relied upon.

## Author

**Shubham Yadav**

Computer Science student focused on AI, Data Engineering, and AI-powered applications.
