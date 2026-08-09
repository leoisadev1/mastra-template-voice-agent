// Runs the Mastra server and the LiveKit voice worker in one container.
// If either process stops, the other is stopped and the container exits with
// the same code, so the platform can restart the whole unit.
//
// This replaces `concurrently --kill-others-on-fail`, which shells out to `ps`
// to kill a process tree. Slim runtime images have no `ps`, so that path failed
// with `spawn ps ENOENT` and hid the real exit reason.
import { spawn } from 'node:child_process';

const procs = [
  { name: 'server', args: ['start'] },
  { name: 'worker', args: ['worker:prod'] },
];

let shuttingDown = false;

const children = procs.map(({ name, args }) => {
  const child = spawn('pnpm', args, { stdio: ['ignore', 'pipe', 'pipe'] });

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

  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[start-all] ${name} exited (code=${code} signal=${signal}), stopping the rest`);
    stopOthers(child);
    process.exit(code ?? 1);
  });

  child.on('error', error => {
    console.error(`[start-all] failed to start ${name}: ${error.message}`);
    if (shuttingDown) return;
    shuttingDown = true;
    stopOthers(child);
    process.exit(1);
  });

  return child;
});

function stopOthers(source) {
  for (const child of children) {
    if (child !== source && child.exitCode === null) child.kill('SIGTERM');
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const child of children) child.kill(signal);
    process.exit(0);
  });
}
