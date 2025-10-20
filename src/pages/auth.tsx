import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabaseClient";
import { Toaster } from "@/components/ui/toaster";

interface Skill {
  skill: string;
  proficiency: "Beginner" | "Intermediate" | "Advanced";
}

interface SignupFormData {
  username: string;
  email: string;
  password: string;
}

interface AuthProps {
  setIsAuthenticated: (val: boolean) => void;
  setCurrentPage: (page: "home" | "auth" | "dashboard") => void;
}

const availableSkills = ["C", "C++", "Python", "Java", "HTML", "CSS", "JavaScript", "English", "Hindi", "Telugu"];

export default function Auth({ setIsAuthenticated, setCurrentPage }: AuthProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [signupStep, setSignupStep] = useState(1);
  const [signupUsername, setSignupUsername] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupFormData, setSignupFormData] = useState<SignupFormData>({ username: "", email: "", password: "" });
  const [selectedSkills, setSelectedSkills] = useState<Skill[]>([]);
  const [aboutMe, setAboutMe] = useState("");

  const addSkill = (skillName: string) => {
    if (!selectedSkills.find((s) => s.skill === skillName)) {
      setSelectedSkills([...selectedSkills, { skill: skillName, proficiency: "Beginner" }]);
    }
  };

  const removeSkill = (skillName: string) => {
    setSelectedSkills(selectedSkills.filter((s) => s.skill !== skillName));
  };

  const updateProficiency = (skillName: string, proficiency: Skill["proficiency"]) => {
    setSelectedSkills(selectedSkills.map((s) => (s.skill === skillName ? { ...s, proficiency } : s)));
  };

  // ---------------- LOGIN ----------------
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!loginEmail || !loginPassword) {
      toast({ title: "Error", description: "Please fill all fields", variant: "destructive" });
      return;
    }

    if (loginPassword.length < 6) {
      toast({ title: "Weak Password", description: "Password must be at least 6 characters.", variant: "destructive" });
      return;
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: loginPassword,
      });

      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
        return;
      }

      if (!data.user) {
        toast({ title: "Invalid Credentials", description: "Email or password is incorrect.", variant: "destructive" });
        return;
      }

      setIsAuthenticated(true);
      setCurrentPage("dashboard");
      toast({ title: "Success", description: "Logged in successfully." });

      setLoginEmail("");
      setLoginPassword("");
    } catch (err: any) {
      toast({ title: "Login Failed", description: err.message || "Something went wrong", variant: "destructive" });
    }
  };

  // ---------------- SIGNUP ----------------
  const handleSignupNext = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!signupUsername || !signupEmail || !signupPassword) {
      toast({ title: "Error", description: "Please fill all fields", variant: "destructive" });
      return;
    }

    if (signupUsername.length < 6) {
      toast({ title: "Invalid Username", description: "Username must be at least 6 characters.", variant: "destructive" });
      return;
    }

    if (signupPassword.length < 6) {
      toast({ title: "Weak Password", description: "Password must be at least 6 characters.", variant: "destructive" });
      return;
    }

    try {
      const { data: existingUser, error } = await supabase.from("users").select("id").eq("email", signupEmail).single();

      if (error && error.code !== "PGRST116" && error.code !== "404") throw error;

      if (existingUser) {
        toast({ title: "Email Exists", description: "An account with this email already exists.", variant: "destructive" });
        return;
      }

      setSignupFormData({ username: signupUsername, email: signupEmail, password: signupPassword });
      setSignupStep(2);
    } catch (err: any) {
      toast({ title: "Signup Failed", description: err.message || "Something went wrong", variant: "destructive" });
    }
  };

  const handleSkillsNext = () => {
    if (selectedSkills.length === 0) {
      toast({ title: "Add Skills", description: "Please add at least one skill.", variant: "destructive" });
      return;
    }
    setSignupStep(3);
  };

  const handleFinalSubmit = async () => {
    if (!aboutMe.trim()) {
      toast({ title: "Incomplete Profile", description: "Please write something about yourself.", variant: "destructive" });
      return;
    }

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: signupFormData.email,
        password: signupFormData.password,
        options: { data: { username: signupFormData.username } },
      });
      if (authError) throw authError;

      const userId = authData.user?.id;
      if (!userId) throw new Error("User ID not found");

      const { error: userError } = await supabase.from("users").insert({
        id: userId,
        username: signupFormData.username,
        email: signupFormData.email,
        about: aboutMe.trim() || null,
        skillpoints: 100,
        swapscompleted: 0,
      });
      if (userError) throw userError;

      const { error: skillsError } = await supabase
        .from("user_skills")
        .insert(selectedSkills.map((s) => ({ user_id: userId, skill: s.skill, proficiency: s.proficiency })));
      if (skillsError) throw skillsError;

      setIsAuthenticated(true);
      setCurrentPage("dashboard");
      toast({ title: "Success", description: "Account created successfully!" });

      setSignupStep(1);
      setSignupUsername("");
      setSignupEmail("");
      setSignupPassword("");
      setSignupFormData({ username: "", email: "", password: "" });
      setSelectedSkills([]);
      setAboutMe("");
    } catch (error: any) {
      toast({ title: "Signup Failed", description: error.message, variant: "destructive" });
    }
  };

  // ---------------- UI ----------------
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Toaster /> {/* <-- This makes toast messages visible */}
      <Card className="w-full max-w-md p-8 border-2 border-border">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold mb-2 font-mono">SKILLSWAP</h1>
          <p className="text-muted-foreground text-sm">Exchange Knowledge. Build Community.</p>
        </div>

        {/* LOGIN / SIGNUP TABS */}
        <div className="flex gap-2 mb-6 border-b-2 border-border">
          <button
            onClick={() => {
              setIsLogin(true);
              setSignupStep(1);
            }}
            className={`flex-1 pb-3 font-mono text-sm ${isLogin ? "border-b-2 border-foreground font-bold" : "text-muted-foreground"}`}
          >
            LOGIN
          </button>
          <button
            onClick={() => {
              setIsLogin(false);
              setSignupStep(1);
            }}
            className={`flex-1 pb-3 font-mono text-sm ${!isLogin ? "border-b-2 border-foreground font-bold" : "text-muted-foreground"}`}
          >
            SIGNUP
          </button>
        </div>

        {/* LOGIN FORM */}
        {isLogin ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-xs font-mono text-muted-foreground block mb-2">EMAIL</label>
              <Input type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} className="font-mono border-2" />
            </div>
            <div>
              <label className="text-xs font-mono text-muted-foreground block mb-2">PASSWORD</label>
              <Input
                type="password"
                value={loginPassword}   
                onChange={(e) => setLoginPassword(e.target.value)}
                className="font-mono border-2"
              />
            </div>
            <Button
              type="submit"
              className="w-full font-mono font-bold border-2 border-foreground hover:bg-foreground hover:text-background transition-smooth"
              variant="outline"
            >
              LOGIN
            </Button>
          </form>
        ) : signupStep === 1 ? (
          /* SIGNUP STEP 1 */
          <form onSubmit={handleSignupNext} className="space-y-4">
            <div>
              <label className="text-xs font-mono text-muted-foreground block mb-2">USERNAME</label>
              <Input
                type="text"
                value={signupUsername}
                onChange={(e) => setSignupUsername(e.target.value)}
                className="font-mono border-2"
              />
            </div>
            <div>
              <label className="text-xs font-mono text-muted-foreground block mb-2">EMAIL</label>
              <Input type="email" value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} className="font-mono border-2" />
            </div>
            <div>
              <label className="text-xs font-mono text-muted-foreground block mb-2">PASSWORD</label>
              <Input
                type="password"
                value={signupPassword}
                onChange={(e) => setSignupPassword(e.target.value)}
                className="font-mono border-2"
              />
            </div>
            <Button
              type="submit"
              className="w-full font-mono font-bold border-2 border-foreground hover:bg-foreground hover:text-background transition-smooth"
              variant="outline"
            >
              NEXT
            </Button>
          </form>
        ) : signupStep === 2 ? (
          /* SIGNUP STEP 2 - SKILLS */
          <div className="space-y-4">
            <h2 className="text-xl font-bold font-mono mb-4">ADD SKILLS</h2>
            <div className="grid grid-cols-2 gap-2">
              {availableSkills.map((skill) => (
                <Button
                  key={skill}
                  onClick={() => addSkill(skill)}
                  variant="outline"
                  className="font-mono text-xs border-2 hover:bg-foreground hover:text-background transition-smooth"
                  disabled={selectedSkills.some((s) => s.skill === skill)}
                >
                  {skill}
                </Button>
              ))}
            </div>

            {selectedSkills.length > 0 && (
              <div className="space-y-2 mt-4 max-h-[140px] overflow-y-auto border-2 border-border p-3">
                {selectedSkills.map(({ skill, proficiency }) => (
                  <div key={skill} className="flex items-center gap-2 border-2 border-border p-2 bg-background">
                    <div className="flex-1">
                      <p className="font-mono text-sm font-bold">{skill}</p>
                      <div className="flex gap-1 mt-1">
                        {["Beginner", "Intermediate", "Advanced"].map((level) => (
                          <button
                            key={level}
                            onClick={() => updateProficiency(skill, level as Skill["proficiency"])}
                            className={`text-xs font-mono px-2 py-1 border transition-smooth ${
                              proficiency === level
                                ? "bg-foreground text-background border-foreground"
                                : "border-border text-muted-foreground hover:border-foreground"
                            }`}
                          >
                            {level}
                          </button>
                        ))}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeSkill(skill)}
                      className="border border-border hover:bg-destructive hover:text-destructive-foreground h-8 w-8"
                    >
                      ×
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <Button
              onClick={handleSkillsNext}
              className="w-full font-mono font-bold border-2 border-foreground hover:bg-foreground hover:text-background transition-smooth mt-4"
              variant="outline"
            >
              NEXT
            </Button>
          </div>
        ) : (
          /* SIGNUP STEP 3 - ABOUT ME */
          <div className="space-y-4">
            <h2 className="text-xl font-bold font-mono mb-4">ABOUT ME</h2>
            <textarea
              value={aboutMe}
              onChange={(e) => setAboutMe(e.target.value)}
              placeholder="Share your interests, experience, or what you're looking to learn..."
              className="w-full min-h-[120px] p-3 font-mono text-sm border-2 border-border bg-background focus:outline-none focus:ring-2 focus:ring-foreground resize-none"
              maxLength={600}
            />
            <p className="text-xs font-mono text-muted-foreground mt-1">{aboutMe.split(/\s+/).filter((w) => w).length} / 100 words</p>
            <Button
              onClick={handleFinalSubmit}
              className="w-full font-mono font-bold border-2 border-foreground hover:bg-foreground hover:text-background transition-smooth"
              variant="outline"
            >
              CREATE ACCOUNT
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
