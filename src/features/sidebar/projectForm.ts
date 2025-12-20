import { Project } from "../../types";

export type ProjectFormValues = {
  referenceId: string;
  name: string;
  description: string;
  address: string;
  projectManager: string;
  startDate: string;
  dueDate: string;
  cost: string;
  color: string;
};

export const defaultProjectFormValues: ProjectFormValues = {
  referenceId: "",
  name: "",
  description: "",
  address: "",
  projectManager: "",
  startDate: "",
  dueDate: "",
  cost: "",
  color: "#2563eb",
};

export const projectFormHasContent = (form: ProjectFormValues): boolean =>
  Boolean(
    form.name.trim() ||
      form.referenceId.trim() ||
      form.address.trim() ||
      form.projectManager.trim() ||
      form.cost.trim() ||
      form.startDate.trim() ||
      form.dueDate.trim() ||
      form.description.trim() ||
      form.color !== defaultProjectFormValues.color,
  );

export const mapProjectToFormValues = (project: Project): ProjectFormValues => ({
  referenceId: project.referenceId ?? "",
  name: project.name ?? "",
  description: project.description ?? "",
  address: project.address ?? "",
  projectManager: project.projectManager ?? "",
  startDate: project.startDate ?? "",
  dueDate: project.dueDate ?? "",
  cost: project.cost ?? "",
  color: project.color ?? "#2563eb",
});
