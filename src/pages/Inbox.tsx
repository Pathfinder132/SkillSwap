import React, { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "@/hooks/use-toast";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Send, Trash2 } from "lucide-react";

interface Friend {
  matchId: number;
  userId: string;
  username: string;
  lastMessageTime: string | null;
  unread?: number;
}

interface Message {
  id: number;
  senderId: string;
  content: string;
  sentAt: string;
}

interface CurrentUser {
  id: string;
  username: string;
}

const Inbox = () => {
  const navigate = useNavigate();
  const { matchId } = useParams<{ matchId: string }>();

  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [selectedFriend, setSelectedFriend] = useState<Friend | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const activeMatchRef = useRef<number | null>(null); // prevents async race conditions

  // Load user
  useEffect(() => {
    const checkAuth = async () => {
      const { data } = await supabase.auth.getUser();
      const user = data?.user;
      if (!user) {
        navigate("/auth");
        return;
      }

      const { data: userData } = await supabase.from("users").select("id, username").eq("id", user.id).single();

      if (userData) setCurrentUser({ id: userData.id, username: userData.username });
    };
    checkAuth();
  }, [navigate]);

  // Load friends
  useEffect(() => {
    if (!currentUser) return;

    const loadFriends = async () => {
      const { data: friendsData, error } = await supabase
        .from("friends")
        .select("match_id, user_a, user_b, created_at")
        .or(`user_a.eq.${currentUser.id},user_b.eq.${currentUser.id}`)
        .order("created_at", { ascending: false });

      if (error || !friendsData) return;

      const friendsList: Friend[] = await Promise.all(
        friendsData.map(async (row) => {
          const otherUserId = row.user_a === currentUser.id ? row.user_b : row.user_a;
          const { data: userData } = await supabase.from("users").select("username").eq("id", otherUserId).single();

          const { count: unreadCount } = await supabase
            .from("messages")
            .select("id", { head: true, count: "exact" })
            .eq("match_id", row.match_id)
            .neq("sender_id", currentUser.id)
            .is("is_read", false);

          const { data: lastMessage } = await supabase
            .from("messages")
            .select("sent_at")
            .eq("match_id", row.match_id)
            .order("sent_at", { ascending: false })
            .limit(1)
            .single();

          return {
            matchId: row.match_id,
            userId: otherUserId,
            username: userData?.username || "Unknown",
            lastMessageTime: lastMessage?.sent_at || null,
            unread: unreadCount || 0,
          };
        })
      );

      setFriends(friendsList);
    };

    loadFriends();
  }, [currentUser]);

  // Load messages for selected friend (and handle initial selection)
  useEffect(() => {
    if (!currentUser) return;

    const targetMatchId = matchId ? parseInt(matchId) : null;
    const currentActiveMatch = selectedFriend?.matchId;

    // Determine if we need to load messages for a NEW match ID
    // 1. User has a matchId in URL but no selectedFriend yet.
    // 2. User clicks a different friend (selectedFriend changes).
    if (targetMatchId === null && currentActiveMatch === null) {
      // No match selected, no match in URL: show "Select a friend"
      return;
    }

    const matchToLoadId = targetMatchId || currentActiveMatch;
    if (matchToLoadId === null) return;

    let cancelled = false;

    const loadMessagesAndFriend = async () => {
      setIsLoadingMessages(true); // **Move to the top of the fetch**
      activeMatchRef.current = matchToLoadId;

      // --- 2a. Fetch Friend/Match Details if not yet set ---
      let friendToUse = selectedFriend;
      if (!friendToUse || friendToUse.matchId !== matchToLoadId) {
        // Find friend in already loaded list
        friendToUse = friends.find((f) => f.matchId === matchToLoadId) || null;

        // If still not found, search the database to check access
        if (!friendToUse && matchToLoadId) {
          const { data: friendRow } = await supabase.from("friends").select("user_a, user_b").eq("match_id", matchToLoadId).single();

          if (!friendRow) {
            navigate("/inbox/access-denied"); // No friendship found
            return;
          }

          const otherUserId = friendRow.user_a === currentUser.id ? friendRow.user_b : friendRow.user_a;
          const { data: userData } = await supabase.from("users").select("username").eq("id", otherUserId).single();

          // Construct a temporary friend object (without unread/lastMessage, which are slow)
          friendToUse = {
            matchId: matchToLoadId,
            userId: otherUserId,
            username: userData?.username || "Unknown",
            lastMessageTime: null,
            unread: 0,
          };
        }

        if (friendToUse) {
          // Update selectedFriend state immediately before setting messages
          setSelectedFriend(friendToUse);
        } else {
          // Final fallback if the match ID is invalid
          navigate("/inbox/access-denied");
          return;
        }
      }

      // --- 2b. Fetch Messages ---
      const { data, error } = await supabase
        .from("messages")
        .select("id, sender_id, content, sent_at")
        .eq("match_id", matchToLoadId)
        .order("sent_at", { ascending: true });

      if (error || cancelled || activeMatchRef.current !== matchToLoadId) {
        setIsLoadingMessages(false);
        return;
      }

      setMessages(
        data.map((msg: any) => ({
          id: msg.id,
          senderId: msg.sender_id,
          content: msg.content,
          sentAt: msg.sent_at,
        }))
      );

      // --- 2c. Mark as Read and Update Sidebar ---
      await supabase
        .from("messages")
        .update({ is_read: true })
        .eq("match_id", matchToLoadId)
        .neq("sender_id", currentUser.id)
        .is("is_read", false);

      // ONLY update friends list if a friend was selected
      if (friendToUse) {
        setFriends((prev) => prev.map((f) => (f.matchId === matchToLoadId ? { ...f, unread: 0 } : f)));
      }

      setIsLoadingMessages(false); // **FLICKER END - Done in one go!**
    };

    loadMessagesAndFriend();

    return () => {
      cancelled = true;
    };
  }, [matchId, friends, currentUser, navigate]); // Added matchId and friends to dependencies

  // Realtime listener
  useEffect(() => {
    if (!selectedFriend || !currentUser) return;

    const channel = supabase
      .channel(`messages-${selectedFriend.matchId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `match_id=eq.${selectedFriend.matchId}`,
        },
        async (payload: any) => {
          const newMsg = payload.new;
          if (activeMatchRef.current !== selectedFriend.matchId) return; // ignore old channels
          setMessages((prev) => [
            ...prev,
            {
              id: newMsg.id,
              senderId: newMsg.sender_id,
              content: newMsg.content,
              sentAt: newMsg.sent_at,
            },
          ]);

          if (newMsg.sender_id !== currentUser.id) {
            await supabase.from("messages").update({ is_read: true }).eq("id", newMsg.id);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedFriend, currentUser]);

  // Send message
  const handleSendMessage = async () => {
    if (!messageInput.trim() || !selectedFriend || !currentUser) return;
    setIsSending(true);

    const { error } = await supabase.from("messages").insert({
      match_id: selectedFriend.matchId,
      sender_id: currentUser.id,
      content: messageInput.trim(),
      is_read: false,
    });

    if (error)
      toast({
        title: "Error",
        description: "Failed to send message",
        variant: "destructive",
      });
    else setMessageInput("");

    setIsSending(false);
  };

  // Delete + Block
  const handleDeleteAndBlock = async (friend: Friend) => {
    if (!currentUser) return;
    const confirmDelete = confirm(`Delete chat with ${friend.username} and block them?`);
    if (!confirmDelete) return;

    try {
      await supabase.from("blocked_users").insert([
        { blocker_id: currentUser.id, blocked_id: friend.userId },
        { blocker_id: friend.userId, blocked_id: currentUser.id },
      ]);

      await supabase.from("friends").delete().eq("match_id", friend.matchId);
      await supabase.from("matches").delete().eq("id", friend.matchId);

      setFriends((prev) => prev.filter((f) => f.matchId !== friend.matchId));
      if (selectedFriend?.matchId === friend.matchId) {
        setSelectedFriend(null);
        setMessages([]);
        navigate("/inbox");
      }

      toast({ title: "Blocked", description: `${friend.username} blocked.` });
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to delete & block user",
        variant: "destructive",
      });
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "short",
    });
  };

  if (!currentUser)
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="font-mono text-muted-foreground">Loading...</p>
      </div>
    );

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar */}
      <div className="w-80 border-r-2 border-border flex flex-col">
        <div className="p-4 border-b-2 border-border">
          <div className="flex items-center gap-3 mb-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")} className="border-2 border-border">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <h1 className="text-xl font-bold font-mono">INBOX</h1>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {friends.length === 0 ? (
            <div className="p-4 text-center text-sm font-mono text-muted-foreground">No matches yet. Start swapping skills!</div>
          ) : (
            friends.map((friend) => (
              <div
                key={friend.matchId}
                onClick={() => {
                  setSelectedFriend(friend);
                  navigate(`/inbox/${friend.matchId}`);
                }}
                className={`p-4 border-b border-border cursor-pointer hover:bg-secondary transition-colors relative ${
                  selectedFriend?.matchId === friend.matchId ? "bg-secondary" : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  <Avatar className="border-2 border-border">
                    <AvatarFallback className="font-mono text-xs bg-primary text-primary-foreground">
                      {friend.username.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <h3 className="font-bold font-mono text-sm">{friend.username}</h3>
                    {friend.lastMessageTime && (
                      <p className="text-xs text-muted-foreground font-mono">{formatTimestamp(friend.lastMessageTime)}</p>
                    )}
                  </div>
                  {friend.unread && friend.unread > 0 && (
                    <div className="ml-2 min-w-[22px] h-6 rounded-full bg-black text-white text-xs flex items-center justify-center px-2">
                      {friend.unread}
                    </div>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteAndBlock(friend);
                    }}
                    className="ml-3 p-1 rounded hover:bg-muted-foreground/20"
                    title="Delete & Block"
                  >
                    <Trash2 className="w-4 h-4 stroke-[2] text-black" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Chat Window */}
      <div className="flex-1 flex flex-col">
        {selectedFriend ? (
          <>
            <div className="p-4 border-b-2 border-border flex items-center gap-3">
              <Avatar className="border-2 border-border">
                <AvatarFallback className="font-mono bg-primary text-primary-foreground">
                  {selectedFriend.username.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <h2 className="font-bold font-mono">{selectedFriend.username}</h2>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {isLoadingMessages ? (
                <p className="text-center text-muted-foreground font-mono text-sm">Loading messages...</p>
              ) : messages.length === 0 ? (
                <p className="text-center text-muted-foreground font-mono text-sm">No messages yet. Start the conversation!</p>
              ) : (
                messages.map((message) => {
                  const isOwn = message.senderId === currentUser.id;
                  return (
                    <div key={message.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-xs px-4 py-2 rounded-lg ${
                          isOwn ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
                        }`}
                      >
                        <p className="font-mono text-sm break-words">{message.content}</p>
                        <p className={`text-xs font-mono mt-1 ${isOwn ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                          {formatTimestamp(message.sentAt)}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="p-4 border-t-2 border-border" position-fixed>
              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder="> type your message..."
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  disabled={isSending}
                  className="flex-1 font-mono border-2"
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={!messageInput.trim() || isSending}
                  className="border-2 border-foreground font-mono"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="font-mono text-muted-foreground">Select a friend to start chatting</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Inbox;
