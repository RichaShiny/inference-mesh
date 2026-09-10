import { supabase } from "../lib/supabase";

export type StoredTicket = {
  id: string;
  text: string;
  category: string;
  predictedCategory: string;
  model: string;
  score: number;
  inferenceMs: number;
  totalMs: number;
  reviewed: boolean;
  policy: string;
  priority: "Normal" | "High";
  status: "open" | "in_progress" | "resolved";
  owner: string;
  timestamp: string;
  workUnit: Record<string, string | number>;
};

export type StorageMode = "cloud" | "browser";

const backupKey = "inferencemesh-support-tickets";

async function workspaceId() {
  const { data, error } = await supabase.rpc("ensure_personal_workspace");
  if (error || !data) throw error ?? new Error("Workspace unavailable.");
  return String(data);
}

function readBackup(): StoredTicket[] {
  try {
    return JSON.parse(localStorage.getItem(backupKey) ?? "[]") as StoredTicket[];
  } catch {
    return [];
  }
}

function writeBackup(tickets: StoredTicket[]) {
  localStorage.setItem(backupKey, JSON.stringify(tickets));
}

function clearBackup() {
  localStorage.removeItem(backupKey);
}

function toRow(ticket: StoredTicket, currentWorkspaceId: string) {
  return {
    id: ticket.id,
    workspace_id: currentWorkspaceId,
    message: ticket.text,
    category: ticket.category,
    predicted_category: ticket.predictedCategory,
    model: ticket.model,
    model_score: ticket.score,
    inference_ms: ticket.inferenceMs,
    total_ms: ticket.totalMs,
    reviewed: ticket.reviewed,
    policy: ticket.policy,
    priority: ticket.priority,
    status: ticket.status,
    owner_name: ticket.owner,
    work_unit: ticket.workUnit,
    created_at: ticket.timestamp,
    updated_at: new Date().toISOString(),
  };
}

function fromRow(row: Record<string, unknown>): StoredTicket {
  return {
    id: String(row.id), text: String(row.message), category: String(row.category),
    predictedCategory: String(row.predicted_category), model: String(row.model),
    score: Number(row.model_score), inferenceMs: Number(row.inference_ms),
    totalMs: Number(row.total_ms), reviewed: Boolean(row.reviewed),
    policy: String(row.policy), priority: row.priority === "High" ? "High" : "Normal",
    status: (row.status as StoredTicket["status"]) ?? "open",
    owner: String(row.owner_name ?? "Unassigned"), timestamp: String(row.created_at),
    workUnit: (row.work_unit ?? {}) as StoredTicket["workUnit"],
  };
}

export async function loadTickets(): Promise<{ tickets: StoredTicket[]; mode: StorageMode }> {
  const backup = readBackup();
  try {
    const currentWorkspaceId = await workspaceId();
    const { data, error } = await supabase.from("support_tickets").select("*").eq("workspace_id", currentWorkspaceId).order("created_at", { ascending: false });
    if (error) throw error;
    const tickets = (data ?? []).map((row) => fromRow(row));
    clearBackup();
    return { tickets, mode: "cloud" };
  } catch {
    return { tickets: backup, mode: "browser" };
  }
}

export async function saveTickets(tickets: StoredTicket[]): Promise<StorageMode> {
  try {
    const currentWorkspaceId = await workspaceId();
    const { error } = await supabase.from("support_tickets").upsert(tickets.map((ticket) => toRow(ticket, currentWorkspaceId)));
    if (error) throw error;
    clearBackup();
    return "cloud";
  } catch {
    writeBackup(tickets);
    return "browser";
  }
}

export async function clearTickets(): Promise<StorageMode> {
  try {
    const currentWorkspaceId = await workspaceId();
    const { error } = await supabase.from("support_tickets").delete().eq("workspace_id", currentWorkspaceId);
    if (error) throw error;
    clearBackup();
    return "cloud";
  } catch {
    clearBackup();
    return "browser";
  }
}
