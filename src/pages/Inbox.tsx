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
  const messageInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Load user
  useEffect(() => {
    /* const checkAuth = async () => {
      const { data } = await supabase.auth.getUser();
      const user = data?.user;
      if (!user) {
        navigate("/auth");
        return;
      }

      const { data: userData } = await supabase.from("users").select("id, username").eq("id", user.id).single();

      if (userData) setCurrentUser({ id: userData.id, username: userData.username });
    };
    checkAuth();*/
    if (!currentUser) {
      const loadUserFromSupabase = async () => {
        const { data: userSession } = await supabase.auth.getUser();
        if (!userSession.user) {
          // This should be unreachable if App.tsx works, but is a fail-safe
          navigate("/auth");
          return;
        }
        const { data: userData } = await supabase.from("users").select("id, username").eq("id", userSession.user.id).single();
        if (userData) setCurrentUser({ id: userData.id, username: userData.username });
      };
      loadUserFromSupabase();
    }
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

    // SCENARIO 1: Navigated to /inbox (no match ID in URL)
    if (targetMatchId === null) {
      if (selectedFriend !== null) {
        setSelectedFriend(null);
        setMessages([]);
      }
      return;
    }

    // SCENARIO 2: Navigated to /inbox/:matchId
    const matchToLoadId = targetMatchId;
    if (matchToLoadId === null) return;

    let cancelled = false;

    const loadMessagesAndFriend = async () => {
      // 💡 CRITICAL: Set ref immediately to prevent race conditions from other useEffect runs
      activeMatchRef.current = matchToLoadId;
      setIsLoadingMessages(true);

      let friendToUse = friends.find((f) => f.matchId === matchToLoadId) || null;

      // --- 1. Fallback: Query DB if friend not found locally ---
      if (!friendToUse) {
        const { data: friendRow } = await supabase
          .from("friends")
          .select("user_a, user_b")
          .eq("match_id", matchToLoadId)
          .or(`user_a.eq.${currentUser.id},user_b.eq.${currentUser.id}`)
          .maybeSingle();

        if (!friendRow) {
          // Not a friend, deny access
          console.warn(`No friendship found in DB for match ID ${matchToLoadId}. Access denied.`);
          navigate("/inbox/access-denied");
          setIsLoadingMessages(false); // 💡 Ensure loading state is cleared here
          return;
        }

        // If found in DB, construct the temporary friend object
        const otherUserId = friendRow.user_a === currentUser.id ? friendRow.user_b : friendRow.user_a;
        const { data: userData } = await supabase.from("users").select("username").eq("id", otherUserId).single();

        friendToUse = {
          matchId: matchToLoadId,
          userId: otherUserId,
          username: userData?.username || "Unknown",
          lastMessageTime: null,
          unread: 0,
        };
      }

      // 💡 Update selectedFriend state if necessary
      if (selectedFriend?.matchId !== friendToUse?.matchId) {
        setSelectedFriend(friendToUse);
      }

      if (!friendToUse) {
        // Final safety net, should not be reached
        setIsLoadingMessages(false);
        return;
      }

      // --- 2. Fetch Messages ---
      const { data, error } = await supabase
        .from("messages")
        .select("id, sender_id, content, sent_at")
        .eq("match_id", matchToLoadId)
        .order("sent_at", { ascending: true });

      // 💡 ONLY check if matchToLoadId is the current active ref (prevents old requests from running)
      if (error || cancelled || activeMatchRef.current !== matchToLoadId) {
        setIsLoadingMessages(false);
        return;
      }

      // ... rest of message processing ...

      setMessages(
        data.map((msg: any) => ({
          id: msg.id,
          senderId: msg.sender_id,
          content: msg.content,
          sentAt: msg.sent_at,
        }))
      );

      // --- 3. Mark as Read and Update Sidebar ---
      // ... (Your existing mark as read logic)
      await supabase
        .from("messages")
        .update({ is_read: true })
        .eq("match_id", matchToLoadId)
        .neq("sender_id", currentUser.id)
        .is("is_read", false);

      // No need to update the entire friends list here, only the unread count (which is handled by mark as read).
      // The main loadFriends useEffect handles full list updates.

      setFriends((prev) => prev.map((f) => (f.matchId === matchToLoadId ? { ...f, unread: 0 } : f)));

      setIsLoadingMessages(false); // 🤩 CRITICAL: Reached the end, clear loading state!
    };

    loadMessagesAndFriend();

    return () => {
      cancelled = true;
    };
    // 💡 IMPORTANT: Removed 'friends' and 'selectedFriend' from dependencies
  }, [matchId, currentUser, navigate]);

  // Auto-scroll to the bottom when messages update or selected friend changes
  useEffect(() => {
    // Use requestAnimationFrame to ensure the DOM is painted with the new messages
    // before attempting to scroll to them.
    const scrollToBottom = () => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    requestAnimationFrame(scrollToBottom);

    // 💡 CRITICAL DEPENDENCY: Scroll when the messages array changes.
    // Including selectedFriend ensures it scrolls correctly when you first load a chat.
  }, [messages, selectedFriend]);

  // NEW useEffect: Forcing scroll on initial load completion
  useEffect(() => {
    // Only execute if messages have been loaded AND it's the first time
    // this chat is being displayed (i.e., when messages.length > 0).
    if (messages.length > 0) {
      // A small timeout (50ms is enough) ensures the scroll runs AFTER the
      // browser finishes rendering the entire fetched message list.
      const timer = setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "instant" }); // Use 'instant' for initial load for snappier experience
      }, 50);

      return () => clearTimeout(timer);
    }
    // 💡 Dependency: Only run when the messages list is first populated.
  }, [messages]);

  // Realtime listener
  useEffect(() => {
    // Use the matchId from the URL params to determine the active channel
    const currentMatchId = matchId ? parseInt(matchId) : null;

    // Only subscribe if a user is logged in AND a specific chat is active in the URL
    if (!currentUser || !currentMatchId) return;

    const channel = supabase
      .channel(`messages-${currentMatchId}`) // Use URL matchId for stable channel name
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `match_id=eq.${currentMatchId}`, // Filter by current matchId
        },
        async (payload: any) => {
          const newMsg = payload.new;

          // 1. Ignore self-sent messages (already handled by optimistic update)
          if (newMsg.sender_id === currentUser.id) {
            return;
          }

          // 2. Ignore messages for an old/inactive chat
          if (activeMatchRef.current !== currentMatchId) return;

          // 3. Update state for the received message
          setMessages((prev) => [
            // Use callback to ensure latest state is used
            ...prev,
            {
              id: newMsg.id,
              senderId: newMsg.sender_id,
              content: newMsg.content,
              sentAt: newMsg.sent_at,
            },
          ]);

          // 4. Mark the received message as read
          await supabase.from("messages").update({ is_read: true }).eq("id", newMsg.id);

          // 5. Update friends list unread count (clear the badge for the active chat)
          setFriends((prev) => prev.map((f) => (f.matchId === currentMatchId ? { ...f, unread: 0 } : f)));
        }
      )
      .subscribe();

    return () => {
      // Cleanup: Unsubscribe from the channel when the component unmounts or dependencies change
      supabase.removeChannel(channel);
    };
    // 💡 CRITICAL: Depend only on matchId and currentUser for stability
  }, [matchId, currentUser]);

  // Send message
  // Send message
  const handleSendMessage = async () => {
    if (!messageInput.trim() || !selectedFriend || !currentUser) return;

    const newMessageContent = messageInput.trim();
    // 1. Clear input and set state
    setMessageInput("");
    setIsSending(true); // Still set this to prevent double-sends

    // 2. Prepare local temporary message
    const tempMessage: Message = {
      id: Date.now(),
      senderId: currentUser.id,
      content: newMessageContent,
      sentAt: new Date().toISOString(),
    };

    // 3. Optimistically add to messages state
    setMessages((prev) => [...prev, tempMessage]);

    // 4. Send to database
    const { error } = await supabase.from("messages").insert({
      match_id: selectedFriend.matchId,
      sender_id: currentUser.id,
      content: newMessageContent,
      is_read: true,
    });

    // 5. Re-enable input (MUST be after the await)
    setIsSending(false);

    if (error) {
      // 6. Rollback:
      setMessages((prev) => prev.filter((msg) => msg.id !== tempMessage.id));
      setMessageInput(newMessageContent);
      toast({
        title: "Error",
        description: "Failed to send message",
        variant: "destructive",
      });
    }
  };
  // New useEffect for Focus
  useEffect(() => {
    // 1. Only run if the input is empty (meaning a message was just sent)
    // AND the chat window is visible.
    if (messageInput === "" && selectedFriend && !isSending) {
      // 2. Wait until the next browser paint to ensure the input is fully rendered/enabled.
      requestAnimationFrame(() => {
        messageInputRef.current?.focus();
      });
    }

    // 3. Depend on messageInput to trigger after it's cleared,
    // and selectedFriend/isSending for conditional re-focusing.
  }, [messageInput, selectedFriend, isSending]);

  // Delete + Block
  const handleDeleteAndBlock = async (friend: Friend) => {
    if (!currentUser) return;
    const confirmDelete = confirm(`Delete chat with ${friend.username} and block them?`);
    if (!confirmDelete) return;

    try {
      // Blocking logic
      await supabase.from("blocked_users").insert([
        { blocker_id: currentUser.id, blocked_id: friend.userId },
        { blocker_id: friend.userId, blocked_id: currentUser.id },
      ]);

      // Deleting match and friend relationship
      await supabase.from("friends").delete().eq("match_id", friend.matchId);
      await supabase.from("matches").delete().eq("id", friend.matchId);

      setFriends((prev) => prev.filter((f) => f.matchId !== friend.matchId));
      if (selectedFriend?.matchId === friend.matchId) {
        setSelectedFriend(null);
        setMessages([]);
        navigate("/inbox"); // Navigate back to the main inbox view
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
    <div className="h-screen flex bg-background">
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

        <div className="flex-1 overflow-y-auto p-4 space-y-4 h-0">
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
              <div ref={messagesEndRef} />
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
                  ref={messageInputRef}
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
