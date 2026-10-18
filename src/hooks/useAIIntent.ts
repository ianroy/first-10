import { useEffect, useRef, useState } from "react";
import { useWorkspaceIdentity } from "@/lib/project-selection";
import type { AIKind } from "@/lib/ai/contracts";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function read(key: string) {
  try {
    const id = sessionStorage.getItem(key);
    return id && uuid.test(id) ? id : null;
  } catch {
    return null;
  }
}
function write(key: string, id: string | null) {
  try {
    if (id) sessionStorage.setItem(key, id);
    else sessionStorage.removeItem(key);
  } catch {
    /* Restricted storage still keeps this mounted action's identifier stable. */
  }
}
/** Identifier only; no prompt/draft storage. Failure keeps the intent until an explicit new request. */
export function useAIIntent(projectId: string, kind: AIKind) {
  const owner = useWorkspaceIdentity();
  const key =
    owner.ready && owner.userId && !owner.error
      ? `firstten:ai-intent:${owner.userId}:${projectId}:${kind}`
      : null;
  const state = useRef<{
    key: string | null;
    id: string | null;
    pending: boolean;
    completed: boolean;
  }>({ key: null, id: null, pending: false, completed: false });
  const active = useRef(true);
  const [uncertainty, setUncertainty] = useState<string | null>(null);
  if (state.current.key !== key)
    state.current = { key, id: key ? read(key) : null, pending: false, completed: false };
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const isCurrent = (id: string) =>
    active.current && key !== null && state.current.key === key && state.current.id === id;
  return {
    uncertain:
      key !== null &&
      (uncertainty === key ||
        (state.current.id !== null && !state.current.pending && !state.current.completed)),
    begin() {
      if (!key || state.current.pending) return null;
      const id = state.current.completed
        ? crypto.randomUUID()
        : (state.current.id ?? read(key) ?? crypto.randomUUID());
      state.current.id = id;
      state.current.pending = true;
      state.current.completed = false;
      write(key, id);
      return id;
    },
    isCurrent,
    succeeded(id: string) {
      if (!isCurrent(id)) return;
      state.current.pending = false;
      if (read(key!) === id) write(key!, null);
      state.current.completed = true;
      setUncertainty(null);
    },
    failed(id: string) {
      if (!isCurrent(id)) return;
      state.current.pending = false;
      setUncertainty(key);
    },
    newRequest() {
      if (!key || state.current.pending) return false;
      state.current.id = null;
      state.current.completed = false;
      write(key, null);
      setUncertainty(null);
      return true;
    },
  };
}
