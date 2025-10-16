
import { useState, useEffect } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';

export type ProfileFormState = {
  email: string;
  fullName: string;
};

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setSession(null);
    } catch (err: any) {
      console.error("Error signing out:", err);
      setError(err.message || "Failed to sign out.");
    }
  };

  const handleUpdateProfile = async (input: ProfileFormState) => {
    if (!session) {
      throw new Error("You must be signed in to update your profile.");
    }

    const trimmedEmail = input.email.trim();
    const trimmedName = input.fullName.trim();

    if (!trimmedEmail) {
      throw new Error("Email is required.");
    }

    if (!trimmedName) {
      throw new Error("Name is required.");
    }

    const updatePayload: {
      email?: string;
      data?: Record<string, unknown>;
    } = {};

    if (trimmedEmail !== session.user.email) {
      updatePayload.email = trimmedEmail;
    }

    updatePayload.data = {
      ...(session.user.user_metadata ?? {}),
      full_name: trimmedName,
    };

    const { data, error } = await supabase.auth.updateUser(updatePayload);
    if (error) {
      throw new Error(error.message);
    }

    if (data?.user) {
      setSession((prev) => (prev ? { ...prev, user: data.user } : prev));
    }
  };

  return { session, loading, error, handleSignOut, handleUpdateProfile };
}
