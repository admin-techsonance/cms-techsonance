'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Megaphone, Bell, CheckCircle2, Clock, AlertTriangle, FileText, IndianRupee } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface Announcement {
  id: number;
  title: string;
  message: string;
  type: string;
  created_at: string;
}

interface ApprovalItem {
  id: number;
  type: 'leave' | 'reimbursement';
  title: string;
  employee: string;
  details: string;
  date: string;
}

export function DashboardAnnouncements({ announcements, alerts }: { announcements: Announcement[], alerts: Announcement[] }) {
  return (
    <Card className="bg-card/50 backdrop-blur-sm border-none shadow-lg h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Megaphone className="h-5 w-5 text-blue-500" />
              Announcements & Alerts
            </CardTitle>
            <CardDescription>Stay updated with company & system notices</CardDescription>
          </div>
          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
            {announcements.length + alerts.length} New
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <ScrollArea className="h-[350px] pr-4">
          <div className="space-y-4">
            {announcements.length === 0 && alerts.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="p-3 rounded-full bg-muted mb-3">
                  <Bell className="h-6 w-6 text-muted-foreground opacity-50" />
                </div>
                <p className="text-sm text-muted-foreground">No active announcements</p>
              </div>
            )}
            
            {/* Company Announcements */}
            {announcements.map((item) => (
              <div key={`ann-${item.id}`} className="group relative flex gap-4 p-3 rounded-xl border border-blue-100 bg-blue-50/30 hover:bg-blue-50 transition-colors">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                  <Megaphone className="h-5 w-5" />
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{item.title}</span>
                    <span className="text-[10px] text-muted-foreground font-medium">
                      {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                    {item.message}
                  </p>
                </div>
              </div>
            ))}

            {/* System Alerts */}
            {alerts.map((item) => (
              <div key={`alert-${item.id}`} className="group relative flex gap-4 p-3 rounded-xl border border-rose-100 bg-rose-50/30 hover:bg-rose-50 transition-colors">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-600">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{item.title}</span>
                    <span className="text-[10px] text-muted-foreground font-medium">
                      {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                    {item.message}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
import { useState } from 'react';
import { Check, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export function DashboardApprovalQueue({ items }: { items: ApprovalItem[] }) {
  const [queue, setQueue] = useState(items);
  const [processing, setProcessing] = useState<number | null>(null);

  if (queue.length === 0) return null;

  const handleAction = async (item: ApprovalItem, action: 'approved' | 'rejected') => {
    setProcessing(item.id);
    const token = localStorage.getItem('session_token');
    
    try {
      const endpoint = item.type === 'leave' 
        ? `/api/leave-requests?id=${item.id}` 
        : `/api/reimbursements?id=${item.id}`;

      const res = await fetch(endpoint, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: action })
      });

      if (!res.ok) throw new Error('Failed to update status');

      toast.success(`${item.title} ${action} successfully`);
      setQueue(prev => prev.filter(q => q.id !== item.id || q.type !== item.type));
    } catch (e: any) {
      toast.error(e.message || 'Error processing request');
    } finally {
      setProcessing(null);
    }
  };

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-none shadow-lg">
      <CardHeader className="pb-3 border-b border-white/10 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              Pending Approvals
            </CardTitle>
            <CardDescription>Actions required for your team</CardDescription>
          </div>
          <Badge className="bg-emerald-500 hover:bg-emerald-600 uppercase tracking-wider text-[10px]">
            High Priority
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[300px] pr-4">
          <div className="space-y-3">
            {queue.map((item) => (
              <div key={`${item.type}-${item.id}`} className="flex items-center justify-between p-3 rounded-xl bg-muted/30 border border-white/5 hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className={`p-2 rounded-lg ${
                    item.type === 'leave' ? 'bg-amber-100 text-amber-600' : 'bg-green-100 text-green-600'
                  }`}>
                    {item.type === 'leave' ? <Clock className="h-5 w-5" /> : <IndianRupee className="h-5 w-5" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm">{item.employee}</p>
                      <Badge variant="outline" className="text-[9px] py-0 px-1 border-white/20 capitalize">
                        {item.type}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{item.details}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <p className="text-[10px] text-muted-foreground font-medium hidden sm:block">
                    {formatDistanceToNow(new Date(item.date), { addSuffix: true })}
                  </p>
                  <div className="flex items-center gap-1">
                    <button 
                      disabled={processing === item.id}
                      onClick={() => handleAction(item, 'approved')}
                      className="p-1.5 rounded-md hover:bg-emerald-100 hover:text-emerald-600 text-muted-foreground transition-colors disabled:opacity-50"
                      title="Approve"
                    >
                      {processing === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    </button>
                    <button 
                      disabled={processing === item.id}
                      onClick={() => handleAction(item, 'rejected')}
                      className="p-1.5 rounded-md hover:bg-rose-100 hover:text-rose-600 text-muted-foreground transition-colors disabled:opacity-50"
                      title="Reject"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

export function DashboardBroadcaster() {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [type, setType] = useState('info');
  const [sending, setSending] = useState(false);

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) return;

    setSending(true);
    const token = localStorage.getItem('session_token');
    
    try {
      const res = await fetch('/api/notifications/broadcast', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ title, message, type })
      });

      if (!res.ok) throw new Error('Failed to broadcast');
      
      const payload = await res.json();
      toast.success(payload.message || 'Announcement broadcasted successfully!');
      setTitle('');
      setMessage('');
      setType('info');
    } catch (e: any) {
      toast.error(e.message || 'Failed to send broadcast');
    } finally {
      setSending(false);
    }
  };

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-none shadow-lg mt-6">
      <CardHeader className="pb-3 border-b border-white/10 mb-4">
        <CardTitle className="text-lg flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-blue-500" />
          Quick Broadcaster
        </CardTitle>
        <CardDescription>Instantly push announcements to all active employees</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleBroadcast} className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <input 
                type="text" 
                placeholder="Announcement Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                required
              />
            </div>
            <select 
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="info">Info</option>
              <option value="success">Success</option>
              <option value="warning">Warning</option>
              <option value="error">Urgent</option>
            </select>
          </div>
          <textarea
            placeholder="Type your message here..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            required
          />
          <button 
            type="submit" 
            disabled={sending || !title.trim() || !message.trim()}
            className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2 w-full"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Megaphone className="h-4 w-4 mr-2" />}
            {sending ? 'Broadcasting...' : 'Broadcast to Organization'}
          </button>
        </form>
      </CardContent>
    </Card>
  );
}
