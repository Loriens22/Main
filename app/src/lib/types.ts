export type ApprovalMode = 'ask' | 'auto-edit' | 'full';

export interface Agent {
  id: string;
  name: string;
  role: string;
  model: string;
  instructions: string;
  color: string;
  isLead: boolean;
  sessionId: string | null;
}

export interface Chat {
  id: string;
  kind: 'single' | 'group';
  title: string;
  projectId: string;
  projectName: string;
  projectColor: string;
  model: string;
  approvalMode: ApprovalMode;
  concurrency: number;
  pinned: boolean;
  archived: boolean;
  allowPaid: boolean;
  preview: string;
  createdAt: number;
  updatedAt: number;
  lastActivityAt: number;
  status: 'idle' | 'busy' | 'retry' | 'waiting' | string;
  pendingApprovals: number;
  agents?: Agent[];
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  repo: string | null;
  color: string;
  createdAt: number;
  updatedAt: number;
}

export interface ModelInfo {
  id: string;
  providerID: string;
  modelID: string;
  providerName: string;
  name: string;
  family?: string;
  free: boolean;
  available: boolean;
  cost: { input: number; output: number };
  limit: { context: number; output: number };
  caps: { tools: boolean; reasoning: boolean; vision: boolean; attachments: boolean; pdf: boolean; temperature: boolean };
  status?: string;
}

export interface Catalog {
  models: ModelInfo[];
  defaultModel: string | null;
  refreshedAt: number;
}

export interface PermissionRequest {
  id: string;
  sessionID: string;
  permission: string;
  patterns: string[];
  title: string;
  metadata: Record<string, any>;
  always: string[];
  createdAt: number;
  agentId?: string;
}

export interface QuestionRequest {
  id: string;
  sessionID: string;
  questions: { question: string; header: string; options: { label: string; description?: string }[]; multiple?: boolean; custom?: boolean }[];
}

export interface Activity {
  kind: string;
  label: string;
  detail?: string;
  ok?: boolean;
  file?: string;
  command?: string;
  passed?: number;
  failed?: number;
  additions?: number;
  deletions?: number;
}

/** OpenCode message (info + parts) as stored on the client. */
export interface Msg {
  info: any;
  parts: Record<string, any>;
  order: string[];
  agentId?: string;
}

export interface GroupTask {
  id: string;
  runId: string;
  idx: number;
  title: string;
  instructions: string;
  agentId: string;
  dependsOn: number[];
  status: 'queued' | 'running' | 'done' | 'failed' | 'blocked' | 'cancelled';
  result: string;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
}

export interface GroupRun {
  id: string;
  chatId: string;
  userText: string;
  status: 'planning' | 'running' | 'summarizing' | 'done' | 'failed' | 'cancelled';
  planSummary: string;
  createdAt: number;
  finishedAt: number | null;
  tasks: GroupTask[];
}

export interface GroupUserMessage {
  id: string;
  role: 'user';
  text: string;
  runId?: string | null;
  targetAgentId?: string | null;
  attachments?: { mime: string; filename?: string }[];
  createdAt: number;
}

export interface ServerSettings {
  defaultModel: string | null;
  defaultApprovalMode: ApprovalMode;
  voice: { voice: string; speed: number };
  enabledProviders: string[];
}

export interface Attachment {
  mime: string;
  filename: string;
  dataUrl: string;
  size: number;
}
