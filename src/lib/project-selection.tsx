/* eslint-disable react-refresh/only-export-components -- Keep the scoped selection provider and its hooks together. */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { CurrentProjectContext } from "@/lib/current-project";
import { supabase } from "@/integrations/supabase/client";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isProjectId = (value: unknown): value is string =>
  typeof value === "string" && uuid.test(value);
export const selectionStorageKey = (userId: string) => `firstten:selected-project:${userId}`;

type ProjectSelection = {
  userId: string;
  selectedProjectId: string | null;
  selectProject: (projectId: string | null) => void;
};
const SelectionContext = createContext<ProjectSelection | null>(null);

function readSelection(userId: string): string | null {
  try {
    const value = window.localStorage.getItem(selectionStorageKey(userId));
    return isProjectId(value) ? value.toLowerCase() : null;
  } catch {
    return null;
  }
}

function UserSelection({ userId, children }: { userId: string; children: ReactNode }) {
  const [selectedProjectId, setSelectedProjectId] = useState(() => readSelection(userId));
  const selectProject = useCallback(
    (id: string | null) => {
      if (id !== null && !isProjectId(id)) throw new Error("Choose a valid project.");
      const selected = id?.toLowerCase() ?? null;
      // Storage is a convenience, not permission. Every query still checks ownership with RLS.
      try {
        if (selected) window.localStorage.setItem(selectionStorageKey(userId), selected);
        else window.localStorage.removeItem(selectionStorageKey(userId));
      } catch {
        // Private browsing/storage restrictions do not prevent switching this session.
      }
      setSelectedProjectId(selected);
    },
    [userId],
  );
  const value = useMemo(
    () => ({ userId, selectedProjectId, selectProject }),
    [userId, selectedProjectId, selectProject],
  );
  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

/** userId must come from the authenticated route's verified auth.getUser(), never metadata. */
export function ProjectSelectionProvider({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  return (
    <UserSelection key={userId} userId={userId}>
      {children}
    </UserSelection>
  );
}

export const useProjectSelection = () => useContext(SelectionContext);

/** Standalone read consumers still require a fresh verified identity; never query unscoped. */
export function useWorkspaceIdentity() {
  const selection = useProjectSelection();
  const resolvedProject = useContext(CurrentProjectContext);
  const resolvedOwner = resolvedProject?.user_id ?? null;
  const [verified, setVerified] = useState<{
    userId: string | null;
    ready: boolean;
    error: Error | null;
  }>({ userId: null, ready: false, error: null });
  useEffect(() => {
    if (selection || resolvedOwner) return;
    let active = true;
    let generation = 0;
    const verify = async () => {
      const current = ++generation;
      setVerified({ userId: null, ready: false, error: null });
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error || !data.user) throw new Error("Sign in to open your saved work.");
        if (active && current === generation)
          setVerified({ userId: data.user.id, ready: true, error: null });
      } catch (error) {
        if (active && current === generation)
          setVerified({
            userId: null,
            ready: true,
            error:
              error instanceof Error ? error : new Error("Your account could not be verified."),
          });
      }
    };
    void verify();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (!["SIGNED_IN", "SIGNED_OUT", "USER_UPDATED"].includes(event)) return;
      generation++;
      setVerified({ userId: null, ready: false, error: null });
      queueMicrotask(() => {
        if (active) void verify();
      });
    });
    return () => {
      active = false;
      generation++;
      data.subscription.unsubscribe();
    };
  }, [selection, resolvedOwner]);
  return selection
    ? {
        userId: selection.userId,
        selectedProjectId: selection.selectedProjectId,
        ready: true,
        error: null,
      }
    : resolvedOwner
      ? // RequireProject already resolved this immutable owner row with a verified identity.
        { userId: resolvedOwner, selectedProjectId: resolvedProject!.id, ready: true, error: null }
      : { ...verified, selectedProjectId: null };
}
