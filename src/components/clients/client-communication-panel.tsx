'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Loader2, Send, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface Communication {
  id: number;
  clientId: number;
  userId: number;
  message: string;
  createdAt: string;
  isRead: boolean;
}

interface ClientCommunicationPanelProps {
  clientId: number;
}

export function ClientCommunicationPanel({ clientId }: ClientCommunicationPanelProps) {
  const router = useRouter();
  const [communications, setCommunications] = useState<Communication[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);

  useEffect(() => {
    fetchCurrentUser();
    fetchCommunications();
  }, [clientId]);

  const fetchCurrentUser = async () => {
    try {
      const token = localStorage.getItem('session_token');
      if (!token) {
        router.push('/login');
        return;
      }

      const response = await fetch('/api/auth/me', {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setCurrentUserId(data.id);
      } else if (response.status === 401) {
        router.push('/login');
      }
    } catch (error) {
      console.error('Error fetching current user:', error);
    }
  };

  const fetchCommunications = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('session_token');
      if (!token) {
        router.push('/login');
        return;
      }

      const response = await fetch(`/api/client-communications?clientId=${clientId}&limit=100`, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setCommunications(data);
      } else if (response.status === 401) {
        router.push('/login');
      }
    } catch (error) {
      console.error('Error fetching communications:', error);
      toast.error('Failed to load communications');
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!message.trim()) {
      toast.error('Please enter a message');
      return;
    }

    if (!currentUserId) {
      toast.error('User not authenticated');
      router.push('/login');
      return;
    }

    setSending(true);
    try {
      const token = localStorage.getItem('session_token');
      if (!token) {
        router.push('/login');
        return;
      }

      const response = await fetch('/api/client-communications', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({
          clientId,
          userId: currentUserId,
          message: message.trim(),
        }),
      });

      if (response.ok) {
        toast.success('Message sent successfully');
        setMessage('');
        fetchCommunications();
      } else if (response.status === 401) {
        toast.error('Authentication required');
        router.push('/login');
      } else {
        const errorData = await response.json();
        toast.error(errorData.error || 'Failed to send message');
      }
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Communication History</CardTitle>
        <CardDescription>Messages and conversations with this client</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="border rounded-lg p-4 h-[400px] overflow-y-auto space-y-4">
            {loading ? (
              <div className="flex justify-center items-center h-full">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : communications.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-sm text-muted-foreground">No messages yet</p>
                <p className="text-xs text-muted-foreground mt-1">Start a conversation below</p>
              </div>
            ) : (
              communications.map((comm) => (
                <div key={comm.id} className="flex gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>U</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">Team Member</p>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(comm.createdAt), 'MMM d, yyyy h:mm a')}
                      </span>
                    </div>
                    <p className="text-sm mt-1 whitespace-pre-wrap">{comm.message}</p>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="flex gap-2">
            <Textarea
              placeholder="Type your message..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              disabled={sending}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <Button onClick={handleSend} disabled={sending || !message.trim()}>
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}