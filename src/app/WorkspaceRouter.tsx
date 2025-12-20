import { Navigate, Route, Routes } from "react-router-dom";
import { Session } from "@supabase/supabase-js";
import { WorkspaceRoot } from "./WorkspaceRoot";

const DEFAULT_PATH = "/workspace/timeline";

export type WorkspaceRouterProps = {
  session: Session;
  onSessionChange: (session: Session | null) => void;
};

export const WorkspaceRouter = ({ session, onSessionChange }: WorkspaceRouterProps) => (
  <Routes>
    <Route
      path="/workspace/:tab"
      element={<WorkspaceRoot session={session} onSessionChange={onSessionChange} />}
    />
    <Route path="/workspace" element={<Navigate to={DEFAULT_PATH} replace />} />
    <Route path="*" element={<Navigate to={DEFAULT_PATH} replace />} />
  </Routes>
);
