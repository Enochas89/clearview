import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export type TimelineItem = {
  id: string;
  body: string;
  noteDate: string;
  createdAt: string;
};

export const useTimeline = (projectId: string | undefined) => {
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTimeline = useCallback(async () => {
    if (!projectId) {
      setTimeline([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from('notes')
      .select('id, note_date, body, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Unable to load timeline', error);
      setTimeline([]);
      setError('Unable to load daily activity.');
      setLoading(false);
      return;
    }

    const items: TimelineItem[] = (data ?? []).map((note) => ({
      id: note.id,
      body: note.body ?? '',
      noteDate: note.note_date ?? 'Unknown date',
      createdAt: note.created_at ?? note.note_date ?? new Date().toISOString(),
    }));

    setTimeline(items);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    fetchTimeline();
  }, [fetchTimeline]);

  return {
    timeline,
    loading,
    error,
    refresh: fetchTimeline,
  };
};

