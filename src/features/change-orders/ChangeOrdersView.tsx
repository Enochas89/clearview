import { useMemo } from "react";
import ChangeOrders from "../../components/ChangeOrders";
import { useWorkspace } from "../../workspace/WorkspaceContext";

const ChangeOrdersView = () => {
  const {
    projects,
    changeOrders,
    selectedProjectId,
    handleCreateChangeOrder,
    handleDeleteChangeOrder,
    handleChangeOrderStatus,
    loading,
  } = useWorkspace();

  const activeProject = useMemo(
    () =>
      selectedProjectId
        ? projects.find((project) => project.id === selectedProjectId) ?? null
        : null,
    [projects, selectedProjectId],
  );

  const projectChangeOrders = useMemo(() => {
    if (!selectedProjectId) {
      return [];
    }
    return changeOrders.filter((order) => order.projectId === selectedProjectId);
  }, [changeOrders, selectedProjectId]);

  if (projects.length === 0 || !selectedProjectId) {
    return (
      <div className="app__empty-state">
        <h2>Select a project</h2>
        <p>Choose a project from the sidebar to manage change orders.</p>
      </div>
    );
  }

  return (
    <ChangeOrders
      project={activeProject}
      orders={projectChangeOrders}
      onCreate={handleCreateChangeOrder}
      onDelete={handleDeleteChangeOrder}
      onChangeStatus={handleChangeOrderStatus}
      isLoading={loading}
    />
  );
};

export default ChangeOrdersView;
