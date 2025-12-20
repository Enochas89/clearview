import { useMemo, useCallback } from "react";
import Sidebar from "../../components/Sidebar";
import { useWorkspace } from "../../workspace/WorkspaceContext";

const SidebarPanel = () => {
  const {
    projects,
    projectMembers,
    session,
    selectedProjectId,
    setSelectedProjectId,
    handleCreateProject,
    handleUpdateProject,
    handleDeleteProject,
    handleInviteMember,
    handleUpdateMemberRole,
    handleRemoveMember,
    handleSignOut,
  } = useWorkspace();

  const membersForSelectedProject = useMemo(() => {
    if (!selectedProjectId) {
      return [];
    }
    return projectMembers.filter((member) => member.projectId === selectedProjectId);
  }, [projectMembers, selectedProjectId]);

  const handleProjectSelect = useCallback(
    (projectId: string) => {
      setSelectedProjectId(projectId);
    },
    [setSelectedProjectId],
  );

  return (
    <Sidebar
      projects={projects}
      selectedProjectId={selectedProjectId}
      members={membersForSelectedProject}
      currentUserId={session?.user?.id ?? ""}
      currentUserEmail={session?.user?.email ?? null}
      memberInviteFallback
      onSelectProject={handleProjectSelect}
      onCreateProject={handleCreateProject}
      onUpdateProject={handleUpdateProject}
      onDeleteProject={handleDeleteProject}
      onInviteMember={handleInviteMember}
      onUpdateMemberRole={handleUpdateMemberRole}
      onRemoveMember={handleRemoveMember}
      onSignOut={handleSignOut}
    />
  );
};

export default SidebarPanel;
