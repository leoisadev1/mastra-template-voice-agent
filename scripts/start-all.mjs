// Runs the Mastra server and the LiveKit voice worker in one container.
//
// The HTTP server is the process that keeps the container alive: if it stops,
// everything stops. The voice worker is restarted with a backoff instead, so a
// bad LiveKit URL or an expired key cannot crash-loop the whole service and
// take the API down with it.
//
// This replaces `concurrently --kill-others-on-fail`, which shells out to `ps`
// to kill a process tree. Slim runtime images have no `ps`, so that path failed
// with `spawn ps ENOENT` and hid the real exit reason.
import { spawn } from 'node:child_process';

const WORKER_RESTART_MIN_MS = 5_000;
const WORKER_RESTART_MAX_MS = 60_000;

let shuttingDown = false;
let workerRestartMs = WORKER_RESTART_MIN_MS;
let workerRestartTimer = null;

function run(name, script) {
  const child = spawn('pnpm', [script], { stdio: ['ignore', 'pipe', 'pipe'] });

  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding('utf8');
    let buffer = '';
    stream.on('data', chunk => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) console.log(`[${name}] ${line}`);
    });
    stream.on('end', () => {
      if (buffer) console.log(`[${name}] ${buffer}`);
    });
  }

  child.on('error', error => console.error(`[start-all] ${name} failed to start: ${error.message}`));
  return child;
}

const server = run('server', 'start');
let worker = run('worker', 'worker:prod');

server.on('exit', (code, signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[start-all] server exited (code=${code} signal=${signal}), stopping the worker`);
  clearTimeout(workerRestartTimer);
  worker.kill('SIGTERM');
  process.exit(code ?? 1);
});

function watchWorker(child) {
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    console.warn(
      `[start-all] worker exited (code=${code} signal=${signal}); the HTTP server stays up. ` +
        `Restarting the worker in ${Math.round(workerRestartMs / 1000)}s. ` +
        `Check LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET.`,
    );
    workerRestartTimer = setTimeout(() => {
      if (shuttingDown) return;
      worker = run('worker', 'worker:prod');
      watchWorker(worker);
      workerRestartMs = Math.min(workerRestartMs * 2, WORKER_RESTART_MAX_MS);
    }, workerRestartMs);
    workerRestartTimer.unref?.();
  });
}

watchWorker(worker);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    clearTimeout(workerRestartTimer);
    server.kill(signal);
    worker.kill(signal);
    process.exit(0);
  });
}
