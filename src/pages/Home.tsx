import React from "react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const Home = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4 text-center">
      <h1 className="text-6xl font-extrabold font-mono mb-4 text-foreground">SKILLSWAP</h1>
      <p className="text-xl text-muted-foreground mb-8">Exchange Knowledge. Build Community.</p>
      <div className="space-y-4 w-full max-w-sm">
        <Button
          onClick={() => navigate("/auth")}
          className="w-full h-12 text-lg font-mono font-bold border-4 border-foreground hover:bg-foreground hover:text-background transition-smooth"
          variant="outline"
        >
          GET STARTED / LOGIN
        </Button>
        <p className="text-sm font-mono text-muted-foreground">Ready to share your skills? Start your knowledge exchange now.</p>
      </div>
    </div>
  );
};

export default Home;
