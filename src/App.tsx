import React, { useEffect, useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Home from "./pages/Home";
import Auth from "./pages/auth";
import Dashboard from "./pages/Dashboard";
import { supabase } from "@/lib/supabaseClient";

const App = () => {
  const [user, setUser] = useState<any>(null);

  const checkUser = async () => {
    const { data } = await supabase.auth.getUser();
    setUser(data.user);
  };

  useEffect(() => {
    checkUser();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route
          path="/auth"
          element={
            user ? (
              <Navigate to="/dashboard" />
            ) : (
              <Auth
                setIsAuthenticated={(isAuth) => {
                  if (isAuth) checkUser(); // fetch the actual logged-in user
                  else setUser(null);
                }}
                setCurrentPage={() => {}}
              />
            )
          }
        />
        <Route path="/dashboard" element={user ? <Dashboard /> : <Navigate to="/auth" />} />
      </Routes>
    </Router>
  );
};

export default App;
