import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { Search, LogOut, Send } from "lucide-react";

// --- Interfaces ---
interface UserSkill {
  id: number;
  skill: string;
  proficiency: string;
}

interface UserData {
  id: string;
  username: string;
  email: string;
  skillpoints: number;
  swapscompleted: number;
  skills: UserSkill[];
}

interface Skill {
  id: number;
  name: string;
}

interface SkillListing {
  id: string;
  skillName: string;
  username: string;
  location: string;
  description: string;
}

// --- Mock Skill Listings Data ---
const mockSkillListings: SkillListing[] = [
  {
    id: "1",
    skillName: "Python Programming",
    username: "Alex Chen",
    location: "San Francisco, CA",
    description: "Advanced Python developer offering tutoring in Django, Flask, and data science",
  },
  {
    id: "2",
    skillName: "Guitar Lessons",
    username: "Maria Garcia",
    location: "Austin, TX",
    description: "10 years experience teaching acoustic and electric guitar, all skill levels welcome",
  },
  {
    id: "3",
    skillName: "Japanese Language",
    username: "Kenji Tanaka",
    location: "Tokyo, JP",
    description: "Native speaker offering conversational Japanese lessons and cultural insights",
  },
];

const Dashboard = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<UserData | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [skills, setSkills] = useState<Skill[]>([]);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [isMatching, setIsMatching] = useState(false);
  const [matchFound, setMatchFound] = useState<{ username: string } | null>(null);

  // Filter mock listings by searchQuery for demo
  const filteredListings = mockSkillListings.filter(
    (listing) =>
      listing.skillName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      listing.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Fetch logged-in user
  const fetchUser = async () => {
    try {
      const { data: currentUser } = await supabase.auth.getUser();
      if (!currentUser.user) throw new Error("User not logged in");

      const { data, error } = await supabase
        .from("users")
        .select("id, username, email, skillpoints, swapscompleted, user_skills(*)")
        .eq("id", currentUser.user.id)
        .single();
      if (error) throw error;

      setUser({
        id: data.id,
        username: data.username,
        email: data.email,
        skillpoints: data.skillpoints,
        swapscompleted: data.swapscompleted,
        skills: data.user_skills.map((s: any) => ({ id: s.id, skill: s.skill, proficiency: s.proficiency })),
      });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      navigate("/auth");
    }
  };

  // Fetch all available skills dynamically
  const fetchSkills = async () => {
    const { data, error } = await supabase.from("skills").select("id, name").order("name");
    if (error) console.error(error);
    else setSkills(data || []);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
    toast({ title: "Logged out", description: "See you next time!" });
  };

  const handleRequestMatch = async () => {
    if (!selectedSkill) {
      toast({ title: "Error", description: "Please select a skill from the list.", variant: "destructive" });
      return;
    }
    if (!user) return;

    setIsMatching(true);
    setMatchFound(null);

    console.log("🔍 Requesting match for skill:", selectedSkill.name, "ID:", selectedSkill.id);

    const { data, error } = await supabase
      .from("requests")
      .insert({
        user_id: user.id,
        username: user.username,
        skill_requested: selectedSkill.id,
      })
      .select();

    if (error) {
      console.error("❌ Error inserting request:", error);
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setIsMatching(false);
      return;
    }

    console.log("✅ Request inserted:", data);

    // If no match found within 5 seconds, stop loading
    setTimeout(() => {
      if (isMatching && !matchFound) {
        setIsMatching(false);
        toast({
          title: "No match found yet",
          description: "Your request is active. We'll notify you when someone matches!",
        });
      }
    }, 5000);
  };

  // ⚡ Realtime listener for matches
  // Polling solution - check for matches every 2 seconds when searching
  useEffect(() => {
    if (!isMatching || !user) return;

    console.log("🔄 Starting polling for matches...");

    const pollForMatch = async () => {
      try {
        // Check if user has any recent matches
        const { data: matches, error } = await supabase
          .from("matches")
          .select("id, user_a, user_b, matched_at")
          .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
          .order("matched_at", { ascending: false })
          .limit(1);

        if (error) {
          console.error("❌ Error polling for match:", error);
          return;
        }

        if (matches && matches.length > 0) {
          const match = matches[0];
          const otherUserId = match.user_a === user.id ? match.user_b : match.user_a;

          // Fetch the other user's username
          const { data: otherUser } = await supabase.from("users").select("username").eq("id", otherUserId).single();

          if (otherUser?.username) {
            console.log("✅ Found match via polling:", otherUser.username);
            setMatchFound({ username: otherUser.username });
            setIsMatching(false);
            toast({
              title: "Match Found!",
              description: `You matched with ${otherUser.username}!`,
              duration: 5000,
            });
          }
        }
      } catch (err) {
        console.error("❌ Polling error:", err);
      }
    };

    // Poll immediately
    pollForMatch();

    // Then poll every 2 seconds
    const interval = setInterval(pollForMatch, 2000);

    return () => {
      console.log("⏹️ Stopping polling");
      clearInterval(interval);
    };
  }, [isMatching, user]);

  useEffect(() => {
    fetchUser();
    fetchSkills();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b-2 border-border bg-background">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold font-mono">SKILLSWAP</h1>

          {/* Searchbar */}
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              placeholder="> search skills..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                const found = skills.find((s) => s.name.toLowerCase() === e.target.value.toLowerCase());
                setSelectedSkill(found || null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRequestMatch();
              }}
              className="pl-10 pr-10 font-mono border-2 bg-background w-full"
            />
            <button onClick={handleRequestMatch} className="absolute right-1 top-1/2 transform -translate-y-1/2 p-1">
              <Search className="w-5 h-5 text-muted-foreground" />
            </button>

            {/* Suggestions Dropdown */}
            {searchQuery && (
              <ul className="absolute z-50 bg-background border border-border mt-1 w-full max-h-40 overflow-y-auto">
                {skills
                  .filter((s) => s.name.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map((s) => (
                    <li
                      key={s.id}
                      className="p-2 hover:bg-secondary cursor-pointer font-mono text-sm"
                      onClick={() => {
                        setSelectedSkill(s);
                        setSearchQuery(s.name);
                      }}
                    >
                      {s.name}
                    </li>
                  ))}
              </ul>
            )}

            {/* Matching Animation / Result */}
            {isMatching && <div className="mt-2 text-center font-mono text-sm animate-pulse">🔄 Searching for a match...</div>}
            {matchFound && (
              <div className="mt-2 text-center font-mono text-sm text-green-500">
                ✅ Found your match! His name is {matchFound.username}
              </div>
            )}
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-mono text-muted-foreground">POINTS</p>
              <p className="font-bold font-mono">{user?.skillpoints || 0}</p>
            </div>
            <Avatar className="border-2 border-border">
              <AvatarFallback className="font-mono bg-secondary">
                {user?.username ? user.username.slice(0, 2).toUpperCase() : "U"}
              </AvatarFallback>
            </Avatar>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              className="border-2 border-border hover:bg-destructive hover:text-destructive-foreground transition-smooth"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <h2 className="text-xl font-bold font-mono mb-6">AVAILABLE SKILL SWAPS</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredListings.map((listing) => (
            <Card key={listing.id} className="p-6 border-2 border-border hover:border-foreground transition-smooth">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <Avatar className="border-2 border-border">
                    <AvatarFallback className="font-mono text-xs bg-secondary">
                      {listing.username
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="font-bold font-mono text-sm">{listing.username}</h3>
                    <p className="text-xs text-muted-foreground">{listing.location}</p>
                  </div>
                </div>
              </div>

              <h2 className="text-xl font-bold mb-2">{listing.skillName}</h2>
              <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{listing.description}</p>

              <div className="flex gap-2">
                <Button
                  onClick={handleRequestMatch}
                  className="flex-1 font-mono font-bold border-2 border-foreground hover:bg-foreground hover:text-background transition-smooth"
                  variant="outline"
                >
                  MATCH (5 PTS)
                </Button>
                <Button
                  onClick={() => toast({ title: "Chat Initiated!", description: `Starting chat with ${listing.username}.` })}
                  variant="ghost"
                  className="border-2 border-border hover:bg-secondary transition-smooth"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>

        {/* User Skills & Stats */}
        <h2 className="text-xl font-bold font-mono mt-12 mb-6">YOUR SKILLS & STATS</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="p-6 border-2 border-border md:col-span-2">
            <h3 className="text-lg font-bold font-mono mb-4 border-b border-border pb-2">SKILLS OFFERED</h3>
            <div className="space-y-3">
              {user?.skills.length ? (
                user.skills.map((skill) => (
                  <div key={skill.id} className="flex justify-between items-center p-3 border border-border">
                    <p className="font-mono font-bold text-sm">{skill.skill}</p>
                    <span className="font-mono text-xs px-2 py-1 bg-secondary text-secondary-foreground">
                      {skill.proficiency.toUpperCase()}
                    </span>
                  </div>
                ))
              ) : (
                <p className="font-mono text-sm text-muted-foreground">No skills added yet. Update your profile!</p>
              )}
            </div>
          </Card>

          <Card className="p-6 border-2 border-border">
            <h3 className="text-lg font-bold font-mono mb-4 border-b border-border pb-2">STATISTICS</h3>
            <div className="space-y-3 font-mono text-sm">
              <div className="flex justify-between">
                <p>Skill Points:</p>
                <span className="font-bold">{user?.skillpoints || 0}</span>
              </div>
              <div className="flex justify-between">
                <p>Swaps Completed:</p>
                <span className="font-bold">{user?.swapscompleted || 0}</span>
              </div>
              <div className="flex justify-between">
                <p>Reputation:</p>
                <span className="font-bold text-yellow-500">★★★☆☆</span>
              </div>
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
