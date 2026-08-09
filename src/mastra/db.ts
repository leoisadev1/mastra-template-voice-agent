/**
 * Single source of truth for the LibSQL database location.
 *
 * Memory, threads, traces, and the semantic-recall vector index all live in one
 * `voice-agent.db` file at the project root. The path is anchored to this module (not the
 * working directory) because the dev server (bundled into `.mastra/output`) and the voice
 * worker (running `src/mastra`) run with different working directories — a plain relative
 * path would give each process its own database. See `index.ts` for why a single SQLite file
 * is used across processes.
 */
import { pathToFileURL } from 'node:url';

// standalone: VOICE_AGENT_DB_PATH (an absolute path, e.g. /data/voice-agent.db on Railway with a
// volume mounted at /data) overrides the module-anchored default. The built server runs from
// .mastra/output while the worker runs from src/mastra, so an env-provided absolute path is the
// only reliable way to make both processes open the SAME file in production.
export const voiceAgentDbUrl = process.env.VOICE_AGENT_DB_PATH
  ? pathToFileURL(process.env.VOICE_AGENT_DB_PATH).href
  : new URL('../../voice-agent.db', import.meta.url).href;
