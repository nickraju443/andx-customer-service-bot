# ANDX Customer Service Bot

AI-powered support chatbot for andxus.io and all ANDX properties.

## Tech Stack
- **Backend:** Python + Flask
- **AI:** Anthropic Claude Haiku
- **Frontend:** Vanilla JavaScript widget (no frameworks)
- **Hosting:** GCP Cloud Run

## Files
| File | What it does |
|------|-------------|
| `app.py` | Flask backend — handles chat API, rate limiting, market data |
| `andx-widget.js` | Drop-in chat widget — creates the purple bubble + chat panel |
| `preview.html` | Landing page for the Cloud Run URL |
| `mobile.html` | Full-screen chat for mobile app WebViews |
| `requirements.txt` | Python dependencies |
| `runtime.txt` | Python version |
| `Procfile` | Start command for deployment |

## How to Add to Any Website
Add this line before `</body>`:
```html
<script src="https://andx-bot-245374915379.us-central1.run.app/andx-widget.js"></script>
```

## API
**Chat endpoint:**
```
POST /api/ask
Content-Type: application/json

{ "question": "What is ANDX?", "mode": "beginner" }
```

**Response:**
```json
{
  "answer": "...",
  "follow_ups": ["How do I sign up?", "What are the fees?"],
  "citations": []
}
```

**Health check:**
```
GET /health
```

## Deploy
```bash
# In GCP Cloud Shell:
rm ~/andx-bot/*
# Upload all files to /home/ai_deployment/andx-bot/
cd ~/andx-bot && gcloud run deploy andx-bot --source . --region us-central1 --allow-unauthenticated
```

## Environment Variables
- `ANTHROPIC_API_KEY` — set on Cloud Run, not in code
- `PORT` — defaults to 8081 locally

## Run Locally
```bash
pip install flask flask-cors anthropic requests
python app.py
# Open http://localhost:8081
```