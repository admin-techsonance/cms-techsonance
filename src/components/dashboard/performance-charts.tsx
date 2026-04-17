'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  Cell,
  PieChart,
  Pie
} from 'recharts';

interface PerformanceChartsProps {
  data: {
    attendanceHistory: { date: string, hours: number }[];
    reportHistory: { date: string, submitted: number }[];
    taskDistribution: { todo: number, in_progress: number, review: number, done: number };
  };
}

export function PerformanceCharts({ data }: PerformanceChartsProps) {
  const taskData = [
    { name: 'To Do', value: data.taskDistribution.todo, color: '#94a3b8' },
    { name: 'In Progress', value: data.taskDistribution.in_progress, color: '#3b82f6' },
    { name: 'Review', value: data.taskDistribution.review, color: '#a855f7' },
    { name: 'Done', value: data.taskDistribution.done, color: '#10b981' },
  ].filter(d => d.value > 0);

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {/* Work Consistency Chart */}
      <Card className="lg:col-span-2 overflow-hidden bg-card/50 backdrop-blur-sm border-none shadow-lg">
        <CardHeader>
          <CardTitle className="text-lg">Work Consistency</CardTitle>
          <CardDescription>Daily productive hours (Last 14 days)</CardDescription>
        </CardHeader>
        <CardContent className="h-[300px] w-full pt-4">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.attendanceHistory}>
              <defs>
                <linearGradient id="colorHours" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.5} />
              <XAxis 
                dataKey="date" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 10, fill: '#64748b' }}
                interval={1}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 10, fill: '#64748b' }}
              />
              <Tooltip 
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                cursor={{ stroke: '#3b82f6', strokeWidth: 2 }}
              />
              <Area 
                type="monotone" 
                dataKey="hours" 
                stroke="#3b82f6" 
                strokeWidth={3}
                fillOpacity={1} 
                fill="url(#colorHours)" 
                animationDuration={1500}
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Task Distribution Pie Chart */}
      <Card className="overflow-hidden bg-card/50 backdrop-blur-sm border-none shadow-lg">
        <CardHeader>
          <CardTitle className="text-lg">Task Status</CardTitle>
          <CardDescription>Productivity breakdown</CardDescription>
        </CardHeader>
        <CardContent className="h-[300px] flex flex-col items-center justify-center pt-0">
          <div className="h-[180px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={taskData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  animationDuration={1500}
                >
                  {taskData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                   contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-4 text-xs font-medium">
            {taskData.map((item) => (
              <div key={item.name} className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-muted-foreground">{item.name}:</span>
                <span>{item.value}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Reporting Regularity Chart */}
      <Card className="lg:col-span-3 overflow-hidden bg-card/50 backdrop-blur-sm border-none shadow-lg">
        <CardHeader>
          <CardTitle className="text-lg">Daily Update Regularity</CardTitle>
          <CardDescription>Check-in consistency (Last 14 days)</CardDescription>
        </CardHeader>
        <CardContent className="h-[200px] w-full pt-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.reportHistory}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.5} />
              <XAxis 
                dataKey="date" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 10, fill: '#64748b' }}
                interval={0}
              />
              <YAxis hide />
              <Tooltip 
                cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const submitted = payload[0].value === 1;
                    return (
                      <div className="bg-white p-2 rounded-lg shadow-md border-none text-xs">
                        <p className="font-semibold text-gray-900">{payload[0].payload.date}</p>
                        <p className={submitted ? "text-emerald-600" : "text-rose-500"}>
                          {submitted ? "✓ Submitted" : "✗ Missed"}
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar 
                dataKey="submitted" 
                radius={[4, 4, 0, 0]}
                animationDuration={1500}
              >
                {data.reportHistory.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={entry.submitted ? '#10b981' : '#f43f5e'} 
                    fillOpacity={0.8}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

interface FinancialChartProps {
  data: {
    month: string;
    revenue: number;
    expenses: number;
  }[];
}

export function FinancialRunRateChart({ data }: FinancialChartProps) {
  if (!data || data.length === 0) return null;

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-none shadow-lg">
      <CardHeader>
        <CardTitle className="text-lg">Financial Run Rate</CardTitle>
        <CardDescription>Revenue vs Expenses (Last 6 Months)</CardDescription>
      </CardHeader>
      <CardContent className="h-[300px] w-full pt-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.3} />
            <XAxis 
              dataKey="month" 
              axisLine={false} 
              tickLine={false} 
              tick={{ fontSize: 11, fill: '#64748b' }}
              dy={10}
            />
            <YAxis 
              axisLine={false} 
              tickLine={false} 
              tick={{ fontSize: 11, fill: '#64748b' }}
              tickFormatter={(value) => `₹${value >= 1000 ? (value / 1000).toFixed(0) + 'K' : value}`}
              dx={-10}
            />
            <Tooltip 
              cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }}
              contentStyle={{ borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', backgroundColor: 'rgba(0,0,0,0.8)', color: 'white' }}
              itemStyle={{ fontSize: '13px', fontWeight: 'bold' }}
              formatter={(value: number) => [`₹${value.toLocaleString()}`, '']}
            />
            <Bar 
              dataKey="revenue" 
              name="Revenue" 
              fill="#10b981" 
              radius={[4, 4, 0, 0]}
              animationDuration={1500}
            />
            <Bar 
              dataKey="expenses" 
              name="Expenses" 
              fill="#f43f5e" 
              radius={[4, 4, 0, 0]}
              animationDuration={1500}
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
