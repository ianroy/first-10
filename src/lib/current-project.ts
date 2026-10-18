import { createContext } from "react";
import type { Project } from "@/lib/data";

// RequireProject resolves the selected project once and supplies it to its shell.
// This context is presentation state, never an authorization boundary.
export const CurrentProjectContext = createContext<Project | null>(null);
