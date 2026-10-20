import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { bus } from './bus.js';
import { getCatalog } from './catalog.js';
import { createChat, deleteChat, getChat, sendSingle, sessionMessages } from './chats.js';
import { config } from './config.js';
import { db } from './db.js';
import { sendGroup } from './groups.js';
import { logger } from './log.js';
import { replyPermission } from './permissions.js';
import { createProject, deleteProject, getProject } from './projects.js';
import { engineFetch } from './voice.js';

const log = logger('SELFTEST');
const pexec = promisify(execFile);

function waitIdle(sessionID: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const t = setTimeout(() => {
      off();
      resolve(false);
    }, timeoutMs);
    const off = bus.onT('session.idle', (e) => {
      if (e.sessionID !== sessionID) return;
      clearTimeout(t);
      off();
      resolve(true);
    });
  });
}

function summarize(messages: any[]): string {
  const out: string[] = [];
  for (const m of messages) {
    for (const p of m.parts ?? []) {
      if (p.type === 'tool') out.push(`${m.info.role}:tool:${p.tool}:${p.state?.status}`);
      if (p.type === 'text' && p.text) out.push(`${m.info.role}:text:${p.text.replace(/\s+/g, ' ').slice(0, 160)}`);
    }
    if (m.info?.error) out.push(`error:${JSON.stringify(m.info.error).slice(0, 200)}`);
  }
  return out.join(' | ');
}

/** End-to-end checks against the real deployment: free model coding, approvals, group orchestration, voice. Results go to the logs. */
export async function runSelfTest(): Promise<void> {
  const results: Record<string, string> = {};
  const catalog = await getCatalog(0);
  const free = catalog.models.filter((m) => m.free && m.available);
  log.info(`free models (${free.length}): ${free.map((m) => `${m.id}[tools:${m.caps.tools}]`).join(', ')}`);
  log.info(`default model: ${catalog.defaultModel}`);
  const candidates = [config.selfTestModel || null, catalog.defaultModel, ...free.filter((m) => m.caps.tools).map((m) => m.id)].filter(Boolean) as string[];
  const project = await createProject({ name: `selftest-${Date.now().toString(36)}` });

  // 1) Real coding task with a free model, auto-approved.
  let workingModel: string | null = null;
  for (const model of [...new Set(candidates)].slice(0, 4)) {
    const chat = await createChat({ projectId: project.id, model, approvalMode: 'full', title: 'selftest code' });
    const sid = getChat(chat.id).session_id!;
    const t0 = Date.now();
    const idle = waitIdle(sid, 240_000);
    await sendSingle(chat.id, {
      text: "Create a file named hello.py that prints exactly: Hello from Maverick\nThen run it with python3 and tell me the output in one sentence.",
    });
    const ok = await idle;
    const msgs = await sessionMessages(getChat(chat.id), sid);
    const file = join(project.path, 'hello.py');
    let out = '';
    if (existsSync(file)) out = (await pexec('python3', [file]).catch((e) => ({ stdout: String(e) }))).stdout.trim();
    const pass = ok && out === 'Hello from Maverick';
    log.info(`coding[${model}] idle=${ok} ${Date.now() - t0}ms file=${existsSync(file)} output=${JSON.stringify(out)} → ${pass ? 'PASS' : 'FAIL'}`);
    log.info(`coding[${model}] transcript: ${summarize(msgs)}`);
    results[`coding:${model}`] = pass ? 'PASS' : 'FAIL';
    await deleteChat(chat.id);
    if (pass) {
      workingModel = model;
      break;
    }
  }

  // 2) Approval flow: bash must wait for the user's OK.
  if (workingModel) {
    const chat = await createChat({ projectId: project.id, model: workingModel, approvalMode: 'ask', title: 'selftest approvals' });
    const sid = getChat(chat.id).session_id!;
    let asked = '';
    const off = bus.onT('permission', (e) => {
      if (e.chatId !== chat.id) return;
      asked = e.request.title;
      void replyPermission(e.request.id, 'once').catch((err) => log.error('approve failed', err));
    });
    const idle = waitIdle(sid, 240_000);
    await sendSingle(chat.id, { text: 'Use the bash tool to run exactly this command: echo approved-by-user > approval.txt' });
    const ok = await idle;
    off();
    const content = existsSync(join(project.path, 'approval.txt')) ? readFileSync(join(project.path, 'approval.txt'), 'utf8').trim() : '';
    const pass = ok && !!asked && content === 'approved-by-user';
    log.info(`approval asked=${JSON.stringify(asked)} file=${JSON.stringify(content)} → ${pass ? 'PASS' : 'FAIL'}`);
    results.approval = pass ? 'PASS' : 'FAIL';
    await deleteChat(chat.id);
  }

  // 3) Voice engine round trip: Kokoro TTS → NeMo streaming ASR.
  try {
    const phrase = 'Create a new project called weather app and run the tests.';
    const t0 = Date.now();
    const r = await engineFetch('/tts', { method: 'POST', body: JSON.stringify({ text: phrase, voice: 'am_michael' }) });
    const wav = Buffer.from(await r.arrayBuffer());
    const ttsMs = Date.now() - t0;
    const rate = wav.readUInt32LE(24);
    const pcm = wav.subarray(44);
    const n = Math.floor((pcm.length / 2) * (16000 / rate));
    const out = Buffer.alloc(n * 2);
    for (let i = 0; i < n; i++) out.writeInt16LE(pcm.readInt16LE(Math.min(pcm.length - 2, Math.floor((i * rate) / 16000) * 2)), i * 2);
    const t1 = Date.now();
    const asr = (await (await engineFetch('/asr', { method: 'POST', body: out })).json()) as { text: string };
    const want = phrase.toLowerCase().replace(/[^a-z ]/g, '').split(' ');
    const got = new Set(asr.text.toLowerCase().split(/\s+/));
    const recall = want.filter((w) => got.has(w)).length / want.length;
    log.info(`voice tts=${ttsMs}ms audio=${(pcm.length / 2 / rate).toFixed(2)}s asr=${Date.now() - t1}ms text=${JSON.stringify(asr.text)} recall=${recall.toFixed(2)} → ${recall >= 0.7 ? 'PASS' : 'FAIL'}`);
    results.voice = recall >= 0.7 ? 'PASS' : 'FAIL';
  } catch (e) {
    log.error('voice check failed', e);
    results.voice = 'FAIL';
  }

  // 4) Group chat: lead plans, a developer implements, results are summarized.
  if (workingModel) {
    const chat = await createChat({
      kind: 'group',
      projectId: project.id,
      model: workingModel,
      approvalMode: 'full',
      concurrency: 2,
      title: 'selftest team',
      agents: [
        { name: 'Maverick', role: 'Tech Lead', isLead: true, model: workingModel },
        { name: 'Sparky', role: 'Developer', model: workingModel },
      ],
    });
    const t0 = Date.now();
    const { runId } = await sendGroup(chat.id, {
      text: 'Create math.js exporting add(a, b) with CommonJS, plus math.test.js that checks add(2, 3) === 5 using node:assert and prints "ok". Run node math.test.js.',
    });
    let status = 'planning';
    while (Date.now() - t0 < 600_000) {
      await new Promise((r) => setTimeout(r, 5000));
      status = (db.prepare('SELECT status FROM group_runs WHERE id = ?').get(runId) as { status: string }).status;
      if (['done', 'failed', 'cancelled'].includes(status)) break;
    }
    const tasks = db.prepare('SELECT idx, title, status, agent_id FROM group_tasks WHERE run_id = ? ORDER BY idx').all(runId) as any[];
    let testOut = '';
    if (existsSync(join(project.path, 'math.test.js')))
      testOut = (await pexec('node', ['math.test.js'], { cwd: project.path }).catch((e) => ({ stdout: String(e.stdout ?? e) }))).stdout.trim();
    const pass = status === 'done' && tasks.length > 0 && /ok/.test(testOut);
    log.info(`group status=${status} ${Math.round((Date.now() - t0) / 1000)}s tasks=${JSON.stringify(tasks.map((t) => `${t.idx + 1}:${t.status}:${t.title}`))} test=${JSON.stringify(testOut)} → ${pass ? 'PASS' : 'FAIL'}`);
    results.group = pass ? 'PASS' : 'FAIL';
    await deleteChat(chat.id);
  }

  try {
    getProject(project.id);
    deleteProject(project.id);
  } catch {
    /* already gone */
  }
  log.info(`RESULT ${JSON.stringify(results)}`);
}
