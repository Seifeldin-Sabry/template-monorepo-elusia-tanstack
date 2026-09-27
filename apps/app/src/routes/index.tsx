import { Badge, Button, Input, Label } from "@starter/ui";
import { useQuery } from "@tanstack/react-query";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import {
  ArrowRight,
  FolderKanban,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import type { FormEvent } from "react";
import { useMemo, useRef, useState } from "react";
import { AppShell } from "../components/app-shell";
import type { Project } from "../lib/api";
import { requireSession } from "../lib/auth-navigation";
import {
  useCreateProject,
  useDeleteProject,
  useUpdateProject,
} from "../lib/project-mutations";
import { projectsQueryOptions } from "../lib/project-query";

type ProjectForm = {
  name: string;
  description: string;
};

const iconStroke = 1.8;
const emptyProjects: Project[] = [];

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Try again.";
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

export const Route = createFileRoute("/")({
  headers: () => ({ "Cache-Control": "private, no-store" }),
  beforeLoad: ({ location }) => requireSession(location.href),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(projectsQueryOptions);
  },
  pendingComponent: LoadingPage,
  errorComponent: LoadErrorPage,
  component: ProjectsPage,
});

function LoadingPage() {
  return (
    <AppShell>
      <main className="app-content" aria-busy="true">
        <div className="page-heading">
          <div>
            <div className="eyebrow">Workspace / Projects</div>
            <h1>Projects</h1>
            <p>Keep meaningful work in motion.</p>
          </div>
        </div>
        <div className="loading-panel" role="status">
          <LoaderCircle size={22} className="spin" aria-hidden="true" />
          Loading projects…
        </div>
      </main>
    </AppShell>
  );
}

function LoadErrorPage({ error }: ErrorComponentProps) {
  const router = useRouter();

  return (
    <AppShell>
      <main className="app-content">
        <div className="page-heading">
          <div>
            <div className="eyebrow">Workspace / Projects</div>
            <h1>Projects</h1>
            <p>Keep work organized, visible, and ready for what comes next.</p>
          </div>
        </div>
        <div className="load-error-panel" role="alert">
          <div className="empty-icon">
            <RefreshCw size={24} strokeWidth={iconStroke} aria-hidden="true" />
          </div>
          <h2>Projects could not be loaded</h2>
          <p>{errorMessage(error)}</p>
          <Button type="button" onClick={() => void router.invalidate()}>
            Try again
          </Button>
        </div>
      </main>
    </AppShell>
  );
}

function ProjectsPage() {
  const { user } = Route.useRouteContext();
  const projectsQuery = useQuery(projectsQueryOptions);
  const createMutation = useCreateProject();
  const updateMutation = useUpdateProject();
  const deleteMutation = useDeleteProject();
  const projects = projectsQuery.data ?? emptyProjects;
  const loadError = projectsQuery.error
    ? errorMessage(projectsQuery.error)
    : null;
  const isRefreshing = projectsQuery.isFetching;
  const isSaving = createMutation.isPending || updateMutation.isPending;
  const isDeleting = deleteMutation.isPending;
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [form, setForm] = useState<ProjectForm>({ name: "", description: "" });
  const [formError, setFormError] = useState<string | null>(null);
  const formDialog = useRef<HTMLDialogElement>(null);
  const deleteDialog = useRef<HTMLDialogElement>(null);
  const mutationError = createMutation.error ?? updateMutation.error;
  const displayedFormError =
    formError ?? (mutationError ? errorMessage(mutationError) : null);
  const deleteError = deleteMutation.error
    ? errorMessage(deleteMutation.error)
    : null;

  const visibleProjects = useMemo(() => {
    const term = search.trim().toLowerCase();
    const matches = term
      ? projects.filter((project) =>
          `${project.name} ${project.description ?? ""}`
            .toLowerCase()
            .includes(term),
        )
      : projects;
    return [...matches].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [projects, search]);

  const latestUpdate = useMemo(() => {
    if (projects.length === 0) return null;
    return [...projects].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    )[0];
  }, [projects]);

  async function refreshProjects() {
    setNotice(null);
    const result = await projectsQuery.refetch();
    if (result.isSuccess) setNotice("Projects are up to date.");
  }

  function openCreate() {
    createMutation.reset();
    updateMutation.reset();
    setEditingProject(null);
    setForm({ name: "", description: "" });
    setFormError(null);
    setNotice(null);
    formDialog.current?.showModal();
  }

  function openEdit(project: Project) {
    createMutation.reset();
    updateMutation.reset();
    setEditingProject(project);
    setForm({ name: project.name, description: project.description ?? "" });
    setFormError(null);
    setNotice(null);
    formDialog.current?.showModal();
  }

  async function saveProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = form.name.trim();
    const description = form.description.trim();

    if (name.length === 0 || name.length > 120) {
      setFormError("Enter a project name between 1 and 120 characters.");
      return;
    }

    setFormError(null);
    try {
      if (editingProject) {
        const updated = await updateMutation.mutateAsync({
          id: editingProject.id,
          input: { name, description },
        });
        setNotice(`“${updated.name}” updated.`);
      } else {
        const created = await createMutation.mutateAsync({ name, description });
        setNotice(`“${created.name}” created.`);
      }
      formDialog.current?.close();
    } catch {
      // Mutation error remains available in dialog until next attempt.
    }
  }

  function openDelete(project: Project) {
    deleteMutation.reset();
    setProjectToDelete(project);
    setNotice(null);
    deleteDialog.current?.showModal();
  }

  async function confirmDelete(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!projectToDelete) return;

    try {
      await deleteMutation.mutateAsync(projectToDelete.id);
      setNotice(`“${projectToDelete.name}” deleted.`);
      deleteDialog.current?.close();
    } catch {
      // Mutation error remains available in dialog until next attempt.
    }
  }

  if (projectsQuery.isPending) return <LoadingPage />;

  return (
    <AppShell userName={user.name}>
      <main className="app-content">
        <section className="page-heading" aria-labelledby="projects-title">
          <div className="page-heading-copy">
            <div className="eyebrow">Workspace / Projects</div>
            <h1 id="projects-title">Projects</h1>
            <p>Keep work organized, visible, and ready for what comes next.</p>
          </div>
          <Button type="button" onClick={openCreate} className="primary-action">
            <Plus size={18} strokeWidth={iconStroke} aria-hidden="true" />
            New project
          </Button>
        </section>

        <section className="workspace-facts" aria-label="Workspace summary">
          <div className="fact-item">
            <span className="fact-label">Total projects</span>
            <strong>{projects.length.toString().padStart(2, "0")}</strong>
          </div>
          <div className="fact-divider" aria-hidden="true" />
          <div className="fact-item fact-item-secondary">
            <span className="fact-label">Last activity</span>
            <strong>
              {latestUpdate
                ? formatDate(latestUpdate.updatedAt)
                : "No activity yet"}
            </strong>
          </div>
          <div className="fact-accent" aria-hidden="true">
            <FolderKanban size={34} strokeWidth={1.2} />
          </div>
        </section>

        {notice && (
          <div className="notice-banner" role="status">
            <span>{notice}</span>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => setNotice(null)}
            >
              <X size={16} strokeWidth={iconStroke} aria-hidden="true" />
            </button>
          </div>
        )}

        {loadError && (
          <div className="error-banner" role="alert">
            <div>
              <strong>Projects could not be loaded</strong>
              <p>{loadError}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={refreshProjects}
              disabled={isRefreshing}
            >
              {isRefreshing ? "Trying again…" : "Try again"}
            </Button>
          </div>
        )}

        <section
          className="projects-section"
          aria-labelledby="project-list-title"
        >
          <div className="section-heading">
            <div>
              <span className="section-kicker">Project library</span>
              <div className="section-title-row">
                <h2 id="project-list-title">All projects</h2>
                <Badge variant="secondary">{projects.length}</Badge>
              </div>
              <p>A focused view of everything in this workspace.</p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="refresh-button"
              onClick={refreshProjects}
              disabled={isRefreshing}
            >
              <RefreshCw
                size={16}
                strokeWidth={iconStroke}
                className={isRefreshing ? "spin" : undefined}
                aria-hidden="true"
              />
              {isRefreshing ? "Refreshing…" : "Refresh"}
            </Button>
          </div>

          <div className="list-surface">
            <div className="list-toolbar">
              <div className="search-field">
                <Search size={17} strokeWidth={iconStroke} aria-hidden="true" />
                <Input
                  type="search"
                  aria-label="Search projects"
                  placeholder="Search projects"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <span className="result-count">
                {visibleProjects.length}{" "}
                {visibleProjects.length === 1 ? "result" : "results"}
              </span>
            </div>

            {visibleProjects.length > 0 ? (
              <ul className="project-list" aria-label="Projects">
                {visibleProjects.map((project) => (
                  <li className="project-row" key={project.id}>
                    <div className="project-icon" aria-hidden="true">
                      <FolderKanban size={20} strokeWidth={iconStroke} />
                    </div>
                    <div className="project-copy">
                      <h3>{project.name}</h3>
                      <p>{project.description || "No description added"}</p>
                    </div>
                    <div className="project-date">
                      <span>Updated</span>
                      <time dateTime={project.updatedAt}>
                        {formatDate(project.updatedAt)}
                      </time>
                    </div>
                    <div className="project-actions">
                      <Button
                        type="button"
                        variant="ghost"
                        aria-label={`Edit ${project.name}`}
                        title={`Edit ${project.name}`}
                        onClick={() => openEdit(project)}
                      >
                        <Pencil
                          size={17}
                          strokeWidth={iconStroke}
                          aria-hidden="true"
                        />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        aria-label={`Delete ${project.name}`}
                        title={`Delete ${project.name}`}
                        onClick={() => openDelete(project)}
                      >
                        <Trash2
                          size={17}
                          strokeWidth={iconStroke}
                          aria-hidden="true"
                        />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : search.trim() ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <Search
                    size={24}
                    strokeWidth={iconStroke}
                    aria-hidden="true"
                  />
                </div>
                <h3>No matching projects</h3>
                <p>Try another name or clear search to see full workspace.</p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSearch("")}
                >
                  Clear search
                </Button>
              </div>
            ) : loadError ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <RefreshCw
                    size={24}
                    strokeWidth={iconStroke}
                    aria-hidden="true"
                  />
                </div>
                <h3>Unable to show projects</h3>
                <p>Check API connection, then try again.</p>
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-icon">
                  <FolderKanban
                    size={26}
                    strokeWidth={iconStroke}
                    aria-hidden="true"
                  />
                </div>
                <h3>Start with one project</h3>
                <p>Create a place for first idea, client, or product.</p>
                <Button type="button" onClick={openCreate}>
                  Create project
                  <ArrowRight
                    size={16}
                    strokeWidth={iconStroke}
                    aria-hidden="true"
                  />
                </Button>
              </div>
            )}
          </div>
        </section>
      </main>

      <dialog
        ref={formDialog}
        className="app-dialog"
        aria-labelledby="project-dialog-title"
        aria-describedby="project-dialog-description"
        onCancel={(event) => {
          if (isSaving) event.preventDefault();
        }}
      >
        <form onSubmit={saveProject}>
          <div className="dialog-heading">
            <div>
              <span className="section-kicker">Project details</span>
              <h2 id="project-dialog-title">
                {editingProject ? "Edit project" : "New project"}
              </h2>
              <p id="project-dialog-description">
                {editingProject
                  ? "Update project name and context."
                  : "Give work a name and a little context."}
              </p>
            </div>
            <button
              type="button"
              className="dialog-close"
              aria-label="Close dialog"
              disabled={isSaving}
              onClick={() => formDialog.current?.close()}
            >
              <X size={19} strokeWidth={iconStroke} aria-hidden="true" />
            </button>
          </div>

          <div className="field-stack">
            <div className="field-group">
              <Label htmlFor="project-name">Project name</Label>
              <Input
                id="project-name"
                name="name"
                autoFocus
                required
                maxLength={120}
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="e.g. Customer portal"
                aria-invalid={Boolean(displayedFormError)}
              />
              <span className="field-hint">Clear, short names work best.</span>
            </div>
            <div className="field-group">
              <Label htmlFor="project-description">
                Description <span className="optional-label">Optional</span>
              </Label>
              <textarea
                id="project-description"
                name="description"
                rows={4}
                maxLength={500}
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                placeholder="What is this project for?"
                className="app-textarea"
              />
            </div>
          </div>

          {displayedFormError && (
            <p className="dialog-error" role="alert">
              {displayedFormError}
            </p>
          )}
          <div className="dialog-actions">
            <Button
              type="button"
              variant="outline"
              disabled={isSaving}
              onClick={() => formDialog.current?.close()}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving && (
                <LoaderCircle size={16} className="spin" aria-hidden="true" />
              )}
              {isSaving
                ? "Saving…"
                : editingProject
                  ? "Save changes"
                  : "Create project"}
            </Button>
          </div>
        </form>
      </dialog>

      <dialog
        ref={deleteDialog}
        className="app-dialog delete-dialog"
        aria-labelledby="delete-dialog-title"
        aria-describedby="delete-dialog-description"
        onCancel={(event) => {
          if (isDeleting) event.preventDefault();
        }}
      >
        <form onSubmit={confirmDelete}>
          <div className="delete-symbol" aria-hidden="true">
            <Trash2 size={23} strokeWidth={iconStroke} />
          </div>
          <h2 id="delete-dialog-title">Delete project?</h2>
          <p id="delete-dialog-description">
            “{projectToDelete?.name}” will be removed from this workspace. This
            action cannot be undone.
          </p>
          {deleteError && (
            <p className="dialog-error" role="alert">
              {deleteError}
            </p>
          )}
          <div className="dialog-actions">
            <Button
              type="button"
              variant="outline"
              disabled={isDeleting}
              onClick={() => deleteDialog.current?.close()}
            >
              Keep project
            </Button>
            <Button type="submit" variant="destructive" disabled={isDeleting}>
              {isDeleting && (
                <LoaderCircle size={16} className="spin" aria-hidden="true" />
              )}
              {isDeleting ? "Deleting…" : "Delete project"}
            </Button>
          </div>
        </form>
      </dialog>
    </AppShell>
  );
}
