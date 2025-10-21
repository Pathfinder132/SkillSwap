import React from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { ShieldAlert } from "lucide-react";

const AccessDenied = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full p-8 border-2 border-border text-center">
        <ShieldAlert className="w-16 h-16 mx-auto mb-4 text-destructive" />
        <h1 className="text-2xl font-bold font-mono mb-2">ACCESS DENIED</h1>
        <p className="font-mono text-sm text-muted-foreground mb-6">
          You don't have permission to view this chat. This conversation is only accessible to matched users.
        </p>
        <div className="flex gap-3 justify-center">
          <Button onClick={() => navigate("/dashboard")} variant="outline" className="font-mono border-2">
            Go to Dashboard
          </Button>
          <Button onClick={() => navigate("/inbox")} className="font-mono border-2">
            View My Chats
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default AccessDenied;
