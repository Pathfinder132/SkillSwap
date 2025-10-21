import React, { useEffect, useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";

import Home from "./pages/Home";
import Auth from "./pages/auth";
import Dashboard from "./pages/Dashboard";
import Inbox from "./pages/Inbox";
import AccessDenied from "./pages/AccessDenied";

import { supabase } from "@/lib/supabaseClient";

const App = () => {
  const [user, setUser] = useState<any>(undefined); // 🛑 Initialize as 'undefined'
  const [isLoadingAuth, setIsLoadingAuth] = useState(true); // 🛑 New state for loading

  const checkUser = async () => {
    const { data } = await supabase.auth.getUser();
    setUser(data.user);
    setIsLoadingAuth(false); // 🛑 Set to false after check
  };

  useEffect(() => {
    checkUser();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      // We don't set isLoadingAuth here, as it only handles the initial load
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // 🛑 CRITICAL: Block rendering the routes until the user status is confirmed
  if (isLoadingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="font-mono text-muted-foreground">Loading Authentication...</p>
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />

        {/* Auth route redirects already-logged-in users */}
        <Route
          path="/auth"
          element={
            user ? (
              <Navigate to="/dashboard" />
            ) : (
              <Auth
                setIsAuthenticated={(isAuth) => {
                  if (isAuth) checkUser();
                  else setUser(null);
                }}
                setCurrentPage={() => {}}
              />
            )
          }
        />

        {/* Re-prioritized Inbox Routes (Specific before Dynamic) */}
        <Route path="/inbox/access-denied" element={user ? <AccessDenied /> : <Navigate to="/auth" />} />

        {/* Protected Routes */}
        <Route path="/dashboard" element={user ? <Dashboard /> : <Navigate to="/auth" />} />
        <Route path="/inbox" element={user ? <Inbox /> : <Navigate to="/auth" />} />
        <Route path="/inbox/:matchId" element={user ? <Inbox /> : <Navigate to="/auth" />} />

        {/* Global Fallback: Redirect logged-in users from junk URLs to dashboard */}
        <Route path="*" element={user ? <Navigate to="/dashboard" /> : <Navigate to="/auth" />} />
      </Routes>
    </Router>
  );
};

export default App;
