import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Send } from "lucide-react";

interface Friend {
  matchId: number;
  userId: string;
  username: string;
  lastMessageTime: string | null;
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

const POLL_INTERVAL = 3000;

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

  // Check authentication and load user
  useEffect(() => {
    const checkAuth = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        navigate("/auth");
        return;
      }

      const { data: userData } = await supabase.from("users").select("id, username").eq("id", user.id).single();

      if (userData) {
        setCurrentUser({ id: userData.id, username: userData.username });
      }
    };

    checkAuth();
  }, [navigate]);

  // Load friends list
  useEffect(() => {
    if (!currentUser) return;

    const loadFriends = async () => {
      const { data: friendsData, error } = await supabase
        .from("friends")
        .select(
          `
          match_id,
          user_a,
          user_b,
          created_at
        `
        )
        .or(`user_a.eq.${currentUser.id},user_b.eq.${currentUser.id}`)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error loading friends:", error);
        return;
      }

      // Fetch usernames and last message times
      const friendsList: Friend[] = await Promise.all(
        friendsData.map(async (friend) => {
          const otherUserId = friend.user_a === currentUser.id ? friend.user_b : friend.user_a;

          const { data: userData } = await supabase.from("users").select("username").eq("id", otherUserId).single();

          const { data: lastMessage } = await supabase
            .from("messages")
            .select("sent_at")
            .eq("match_id", friend.match_id)
            .order("sent_at", { ascending: false })
            .limit(1)
            .single();

          return {
            matchId: friend.match_id,
            userId: otherUserId,
            username: userData?.username || "Unknown",
            lastMessageTime: lastMessage?.sent_at || null,
          };
        })
      );

      setFriends(friendsList);
    };

    loadFriends();
  }, [currentUser]);

  // Handle match ID from URL parameter
  useEffect(() => {
    if (!matchId || !friends.length) return;

    const friend = friends.find((f) => f.matchId === parseInt(matchId));
    if (friend) {
      setSelectedFriend(friend);
    } else {
      // User doesn't have access to this match
      navigate("/inbox/access-denied");
    }
  }, [matchId, friends, navigate]);

  // Load messages for selected friend
  useEffect(() => {
    if (!selectedFriend) return;

    const loadMessages = async () => {
      setIsLoadingMessages(true);

      const { data: messagesData, error } = await supabase
        .from("messages")
        .select("id, sender_id, content, sent_at")
        .eq("match_id", selectedFriend.matchId)
        .order("sent_at", { ascending: true });

      if (error) {
        console.error("Error loading messages:", error);
      } else {
        setMessages(
          messagesData.map((msg) => ({
            id: msg.id,
            senderId: msg.sender_id,
            content: msg.content,
            sentAt: msg.sent_at,
          }))
        );
      }

      setIsLoadingMessages(false);
    };

    loadMessages();
  }, [selectedFriend]);

  // Realtime listener for new messages
  useEffect(() => {
    if (!selectedFriend || !currentUser) return;

    console.log("Setting up Realtime listener for messages");

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
        (payload) => {
          console.log("New message received:", payload);
          const newMessage = payload.new;
          setMessages((prev) => [
            ...prev,
            {
              id: newMessage.id,
              senderId: newMessage.sender_id,
              content: newMessage.content,
              sentAt: newMessage.sent_at,
            },
          ]);
        }
      )
      .subscribe((status) => {
        console.log("Messages Realtime status:", status);
      });

    return () => {
      console.log("Unsubscribing from messages Realtime");
      supabase.removeChannel(channel);
    };
  }, [selectedFriend, currentUser]);

  // Polling fallback for messages
  useEffect(() => {
    if (!selectedFriend) return;

    const pollMessages = async () => {
      const { data: messagesData } = await supabase
        .from("messages")
        .select("id, sender_id, content, sent_at")
        .eq("match_id", selectedFriend.matchId)
        .order("sent_at", { ascending: true });

      if (messagesData) {
        setMessages(
          messagesData.map((msg) => ({
            id: msg.id,
            senderId: msg.sender_id,
            content: msg.content,
            sentAt: msg.sent_at,
          }))
        );
      }
    };

    const interval = setInterval(pollMessages, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [selectedFriend]);

  // Send message
  const handleSendMessage = async () => {
    if (!messageInput.trim() || !selectedFriend || !currentUser) return;

    setIsSending(true);

    const { error } = await supabase.from("messages").insert({
      match_id: selectedFriend.matchId,
      sender_id: currentUser.id,
      content: messageInput.trim(),
    });

    if (error) {
      console.error("Error sending message:", error);
      toast({
        title: "Error",
        description: "Failed to send message",
        variant: "destructive",
      });
    } else {
      setMessageInput("");
    }

    setIsSending(false);
  };

  // Format timestamp to IST
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

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="font-mono text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Friends sidebar */}
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
            <div className="p-4 text-center">
              <p className="font-mono text-sm text-muted-foreground">No matches yet. Start swapping skills!</p>
            </div>
          ) : (
            friends.map((friend) => (
              <div
                key={friend.matchId}
                onClick={() => {
                  setSelectedFriend(friend);
                  navigate(`/inbox/${friend.matchId}`);
                }}
                className={`p-4 border-b border-border cursor-pointer hover:bg-secondary transition-colors ${
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
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Chat window */}
      <div className="flex-1 flex flex-col">
        {selectedFriend ? (
          <>
            {/* Chat header */}
            <div className="p-4 border-b-2 border-border">
              <div className="flex items-center gap-3">
                <Avatar className="border-2 border-border">
                  <AvatarFallback className="font-mono bg-primary text-primary-foreground">
                    {selectedFriend.username.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <h2 className="font-bold font-mono">{selectedFriend.username}</h2>
              </div>
            </div>

            {/* Messages area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {isLoadingMessages ? (
                <div className="text-center text-muted-foreground font-mono text-sm">Loading messages...</div>
              ) : messages.length === 0 ? (
                <div className="text-center text-muted-foreground font-mono text-sm">No messages yet. Start the conversation!</div>
              ) : (
                messages.map((message) => {
                  const isOwnMessage = message.senderId === currentUser.id;
                  return (
                    <div key={message.id} className={`flex ${isOwnMessage ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-xs px-4 py-2 rounded-lg ${
                          isOwnMessage ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
                        }`}
                      >
                        <p className="font-mono text-sm break-words">{message.content}</p>
                        <p className={`text-xs font-mono mt-1 ${isOwnMessage ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                          {formatTimestamp(message.sentAt)}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Message input */}
            <div className="p-4 border-t-2 border-border">
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
