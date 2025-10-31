import { useEffect, useState } from "react";
import { Session } from "@supabase/supabase-js";
import { supabase } from "../supabaseClient";
import Auth from "../Auth";
import AppLoadingScreen from "./AppLoadingScreen";

type AuthenticatedRenderProps = {
  session: Session;
  onSessionChange: (session: Session | null) => void;
};

type AuthGateProps = {
  children: (context: AuthenticatedRenderProps) => React.ReactNode;
};

export const AuthGate = ({ children }: AuthGateProps) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        setSession(nextSession);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return <AppLoadingScreen message="Signing you in..." />;
  }

  if (!session) {
    return <Auth />;
  }

  return <>{children({ session, onSessionChange: setSession })}</>;
};
