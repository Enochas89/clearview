import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { ProjectFormValues } from "./projectForm";

type ProjectFormCardProps = {
  initialValues: ProjectFormValues;
  isEditing: boolean;
  onSubmit: (values: ProjectFormValues) => Promise<void>;
  onDelete?: () => Promise<void>;
  onCancel: () => void;
  onDraftChange?: (values: ProjectFormValues) => void;
};

const ProjectFormCard = ({
  initialValues,
  isEditing,
  onSubmit,
  onDelete,
  onCancel,
  onDraftChange,
}: ProjectFormCardProps) => {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
    watch,
  } = useForm<ProjectFormValues>({
    defaultValues: initialValues,
  });

  useEffect(() => {
    reset(initialValues);
  }, [initialValues, reset]);

  useEffect(() => {
    if (!onDraftChange) {
      return;
    }
    const subscription = watch((values) => {
      onDraftChange(values as ProjectFormValues);
    });
    return () => subscription.unsubscribe();
  }, [watch, onDraftChange]);

  const submit = handleSubmit(async (values) => {
    await onSubmit(values);
  });

  const handleDelete = async () => {
    if (!onDelete) {
      return;
    }
    try {
      await onDelete();
    } catch {
      // Notification already surfaced upstream
    }
  };

  return (
    <form className="sidebar__form sidebar__form--card" onSubmit={submit}>
      <h3>{isEditing ? "Edit project" : "Add project"}</h3>

      <label>
        Project ID
        <input
          type="text"
          placeholder="PRJ-1000"
          disabled={isSubmitting}
          {...register("referenceId", { required: "Project ID is required." })}
        />
        {errors.referenceId && <span className="sidebar__error">{errors.referenceId.message}</span>}
      </label>

      <label>
        Name
        <input
          type="text"
          placeholder="Project name"
          disabled={isSubmitting}
          {...register("name", { required: "Project name is required." })}
        />
        {errors.name && <span className="sidebar__error">{errors.name.message}</span>}
      </label>

      <label>
        Description
        <input
          type="text"
          placeholder="What are we building?"
          disabled={isSubmitting}
          {...register("description")}
        />
      </label>

      <label>
        Address
        <input
          type="text"
          placeholder="123 Main Street, City, State"
          disabled={isSubmitting}
          {...register("address", { required: "Project location is required." })}
        />
        {errors.address && <span className="sidebar__error">{errors.address.message}</span>}
      </label>

      <label>
        Project Manager
        <input
          type="text"
          placeholder="Who is leading this?"
          disabled={isSubmitting}
          {...register("projectManager", { required: "Project manager is required." })}
        />
        {errors.projectManager && <span className="sidebar__error">{errors.projectManager.message}</span>}
      </label>

      <div className="sidebar__form-grid">
        <label>
          Start Date
          <input
            type="date"
            disabled={isSubmitting}
            {...register("startDate", { required: "Start date is required." })}
          />
          {errors.startDate && <span className="sidebar__error">{errors.startDate.message}</span>}
        </label>

        <label>
          Due Date
          <input
            type="date"
            disabled={isSubmitting}
            {...register("dueDate", { required: "Due date is required." })}
          />
          {errors.dueDate && <span className="sidebar__error">{errors.dueDate.message}</span>}
        </label>

        <label>
          Cost
          <input
            type="text"
            placeholder="$10,000"
            disabled={isSubmitting}
            {...register("cost", { required: "Budget is required." })}
          />
          {errors.cost && <span className="sidebar__error">{errors.cost.message}</span>}
        </label>

        <label>
          Accent color
          <input type="color" disabled={isSubmitting} {...register("color")} />
        </label>
      </div>

      <div className="sidebar__form-actions">
        {isEditing && (
          <button type="button" className="sidebar__danger" onClick={handleDelete} disabled={isSubmitting}>
            Delete project
          </button>
        )}
        <button type="button" className="sidebar__muted" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </button>
        <button type="submit" className="sidebar__primary" disabled={isSubmitting}>
          {isEditing ? "Save changes" : "Create project"}
        </button>
      </div>
    </form>
  );
};

export default ProjectFormCard;
