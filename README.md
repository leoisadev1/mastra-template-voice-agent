# Mastra voice agent template — call center on LiveKit

A call center voice agent for a fictional trades contractor ("Meridian Trades"), built with [`@mastra/livekit`](https://www.npmjs.com/package/@mastra/livekit). LiveKit runs the audio loop (WebRTC, speech-to-text, semantic turn detection, barge-in, text-to-speech). A Mastra agent generates every reply, with tools for lead capture, a service-area check, scheduling, and end-of-call intake reconciliation. Three layers of caller-scoped memory (working memory, semantic recall, observational memory) let the agent recognize returning callers.

## Deploy on Railway

The service runs two processes with one start command (`pnpm start:all`):

1. The Mastra HTTP server (`mastra start`, port 4111, health check on `/health`).
2. The LiveKit voice worker (`src/mastra/voice-worker.ts` in production mode). It connects out to LiveKit Cloud and answers calls.

Setup:

1. Create a free LiveKit Cloud project at [cloud.livekit.io](https://cloud.livekit.io) and copy the URL, API key, and secret from Settings -> API Keys.
2. Set the required variables (table below).
3. Attach a volume and set `VOICE_AGENT_DB_PATH=${{RAILWAY_VOLUME_MOUNT_PATH}}/voice-agent.db` so both processes share one database across deploys.

`railway.json` sets `HF_HOME=/app/.cache/huggingface` for the build and the start command, so the turn-detection model (~450 MB) downloaded at build time is found at runtime. Override `HF_HOME` only if you need a different cache path.

## Services

- **App service** — Mastra server + LiveKit voice worker (this repo). No other services are needed; LiveKit Cloud is external SaaS.

## Environment variables

| Name | Required | Description |
| --- | --- | --- |
| `LIVEKIT_URL` | Yes | LiveKit Cloud project URL (`wss://...livekit.cloud`). |
| `LIVEKIT_API_KEY` | Yes | LiveKit API key. |
| `LIVEKIT_API_SECRET` | Yes | LiveKit API secret. |
| `OPENAI_API_KEY` | Yes | OpenAI key for the agent model, memory observer, and recall embedder. |
| `VOICE_AGENT_DB_PATH` | No | Absolute path to the shared LibSQL file. Set `${{RAILWAY_VOLUME_MOUNT_PATH}}/voice-agent.db` on Railway with a volume attached. Default: `./voice-agent.db`. |
| `PORT` | No | Mastra server port. Default `4111`. |
| `MASTRA_URL` | No | Server URL for the optional plugin worker. Default `http://localhost:4111`. |
| `HF_HOME` | No | Hugging Face cache dir for the turn-detection model. `railway.json` already defaults it to `/app/.cache/huggingface`. |

STT (`deepgram/nova-3`) and TTS (`cartesia/sonic-3`) run through LiveKit Inference. The LiveKit free tier includes inference credit, so no Deepgram or Cartesia accounts are needed.

## Local development

```bash
pnpm install
cp .env.example .env   # fill in LIVEKIT_* and OPENAI_API_KEY
pnpm worker:download-files   # one-time: downloads the turn-detection and VAD models

pnpm dev      # Mastra server + Studio on :4111
pnpm worker   # LiveKit voice worker (agent entrypoint), in a second terminal
```

Open Studio at `http://localhost:4111`, open the **Meridian Trades Front Desk** agent chat, click the phone button, and allow microphone access. You should hear Jordan's greeting.

Alternative worker entrypoints for local experiments (run one at a time — all register as `mastra-voice`): `pnpm worker:workflow`, `pnpm worker:plugin`, `pnpm worker:regulated`.

## Endpoints to try

> **This route is open by design for the demo.** It mints a real LiveKit access token
> and starts an agent session, so anyone who knows the URL can spend your LiveKit and
> OpenAI credit. Put it behind `server.auth`, or set `requiresAuth: true` on
> `liveKitConnectionRoute` in `src/mastra/index.ts`, before you give the service a
> public domain.

```bash
# Health check
curl https://<your-app>.up.railway.app/health

# List agents
curl https://<your-app>.up.railway.app/api/agents

# Connection details for a LiveKit voice session (what a frontend calls to join a call)
curl -X POST https://<your-app>.up.railway.app/voice/livekit/connection-details \
  -H "Content-Type: application/json" \
  -d '{"resourceId": "caller-demo"}'
```

Things to try on a call: ask for a painting quote (lead capture), book a roof inspection at zip `94103` (in area) or `90210` (out of area), or say "Hi, it's Shane Thomas, 555-0142" (returning customer with a booked visit). Hang up and call again — the agent remembers you.
