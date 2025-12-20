import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNotifications } from '../notifications/NotificationContext';

export type MobileProject = {
  id: string;
  name: string;
  reference_id: string | null;
  project_manager: string | null;
  color: string | null;
};

const PROJECT_SELECT =
  'id, name, reference_id, project_manager, color';

export const useProjects = () => {
  const [projects, setProjects] = useState<MobileProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { push } = useNotifications();

  const fetchProjects = useCallback(
    async (withLoader: boolean) => {
      if (withLoader) {
        setLoading(true);
      }

      const session = await supabase.auth.getSession();
      const user = session.data.session?.user;

      if (!user) {
        setProjects([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const memberFilters = [`user_id.eq.${user.id}`];
      if (user.email) {
        memberFilters.push(`email.eq.${user.email}`);
      }

      let memberQuery = supabase.from('project_members').select('project_id');
      memberQuery =
        memberFilters.length === 1
          ? memberQuery.eq('user_id', user.id)
          : memberQuery.or(memberFilters.join(','));

      try {
        const [{ data: memberRows, error: memberError }, { data: ownedRows, error: ownedError }] =
          await Promise.all([
            memberQuery,
            supabase.from('projects').select(PROJECT_SELECT).eq('user_id', user.id),
          ]);

        if (memberError || ownedError) {
          throw memberError ?? ownedError;
        }

        const projectIds = (memberRows ?? []).map((row) => row.project_id);
        const { data: invitedProjects, error: invitedError } =
          projectIds.length > 0
            ? await supabase.from('projects').select(PROJECT_SELECT).in('id', projectIds)
            : { data: [], error: null };

        if (invitedError) {
          throw invitedError;
        }

        const allProjects = [...(ownedRows ?? []), ...((invitedProjects ?? []) as MobileProject[])];
        const deduped = Array.from(new Map(allProjects.map((p) => [p.id, p])).values()).sort((a, b) =>
          a.name.localeCompare(b.name),
        );

        setProjects(deduped);
      } catch (cause: any) {
        console.error('Unable to load projects', cause);
        const message = 'Unable to load projects. Pull to refresh and try again.';
        push('error', message);
        setProjects([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [push],
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await fetchProjects(false);
  }, [fetchProjects]);

  useEffect(() => {
    fetchProjects(true);
  }, [fetchProjects]);

  return {
    projects,
    loading,
    refreshing,
    refresh,
  };
};
