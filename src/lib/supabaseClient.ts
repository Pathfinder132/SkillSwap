import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://lybhzhbofmwcjpdxsrau.supabase.co";
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx5Ymh6aGJvZm13Y2pwZHhzcmF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA2ODg3NTQsImV4cCI6MjA3NjI2NDc1NH0.j1eSTaWiSCmpvWR0zmdJbxGVnzReYVZi_EdU5rtYwHQ";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

// Log Realtime connection status
if (typeof window !== "undefined") {
  console.log("🔌 Supabase client initialized with Realtime");
}
