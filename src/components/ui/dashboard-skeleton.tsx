import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function PageHeaderSkeleton() {
  return (
    <div className="space-y-2 mb-8">
      <Skeleton className="h-9 w-1/3" animation="pulse" />
      <Skeleton className="h-5 w-1/2" animation="pulse" />
    </div>
  );
}

export function StatsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className={`grid gap-4 md:grid-cols-2 lg:grid-cols-${count}`}>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="border-none shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <Skeleton className="h-4 w-1/2" animation="pulse" />
            <Skeleton className="h-4 w-4 rounded-full" animation="pulse" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-8 w-2/3 mb-2" animation="shimmer" />
            <Skeleton className="h-3 w-1/3" animation="pulse" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function TableSkeleton({ columns = 5, rows = 5 }: { columns?: number; rows?: number }) {
  return (
    <Card className="border-none shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="space-y-2 w-full">
            <Skeleton className="h-6 w-1/4" animation="pulse" />
            <Skeleton className="h-4 w-1/3" animation="pulse" />
          </div>
          <div className="flex gap-2 text-right">
            <Skeleton className="h-9 w-24" animation="pulse" />
            <Skeleton className="h-9 w-24" animation="pulse" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center gap-4 border-b pb-4">
            {Array.from({ length: columns }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" animation="pulse" />
            ))}
          </div>
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 py-2 border-b last:border-0">
              {Array.from({ length: columns }).map((_, j) => (
                <Skeleton key={j} className="h-6 w-full" animation="shimmer" />
              ))}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function KanbanSkeleton({ columns = 4 }: { columns?: number }) {
  return (
    <div className={`grid gap-4 md:grid-cols-2 lg:grid-cols-${columns}`}>
      {Array.from({ length: columns }).map((_, i) => (
        <div key={i} className="flex flex-col gap-4">
          <Skeleton className="h-10 w-full" animation="pulse" />
          {Array.from({ length: 3 }).map((_, j) => (
            <Card key={j} className="border-none shadow-sm">
              <CardContent className="p-4 space-y-3">
                <Skeleton className="h-4 w-3/4" animation="pulse" />
                <Skeleton className="h-16 w-full" animation="shimmer" />
                <div className="flex justify-between">
                  <Skeleton className="h-6 w-16" animation="pulse" />
                  <Skeleton className="h-8 w-8 rounded-full" animation="pulse" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ))}
    </div>
  );
}

export function TabsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-6">
      <div className="flex gap-1 bg-muted p-1 rounded-lg w-fit">
        {Array.from({ length: count }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-32" animation="pulse" />
        ))}
      </div>
      <DetailedPageSkeleton />
    </div>
  );
}

export function DetailedPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="md:col-span-1 border-none shadow-sm">
          <CardHeader>
            <Skeleton className="h-6 w-1/4" animation="pulse" />
          </CardHeader>
          <CardContent className="space-y-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-1/4" animation="pulse" />
                <Skeleton className="h-10 w-full" animation="shimmer" />
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="md:col-span-1 border-none shadow-sm">
          <CardHeader>
            <Skeleton className="h-6 w-1/4" animation="pulse" />
          </CardHeader>
          <CardContent className="space-y-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-1/3" animation="pulse" />
                <Skeleton className="h-16 w-full" animation="shimmer" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function ContentSkeleton() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <StatsSkeleton count={4} />
      <TableSkeleton rows={8} />
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-20 w-20 rounded-full" animation="shimmer" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" animation="pulse" />
          <Skeleton className="h-4 w-32" animation="pulse" />
        </div>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i} className="border-none shadow-sm">
            <CardHeader>
              <Skeleton className="h-5 w-1/3" animation="pulse" />
            </CardHeader>
            <CardContent className="space-y-4">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="flex justify-between items-center">
                  <Skeleton className="h-4 w-1/4" animation="pulse" />
                  <Skeleton className="h-4 w-1/3" animation="pulse" />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function InlineTableSkeleton({ rows = 5, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 py-3 border-b last:border-0">
          {Array.from({ length: columns }).map((_, j) => (
            <Skeleton key={j} className="h-5 w-full" animation="shimmer" />
          ))}
        </div>
      ))}
    </>
  );
}

export function MetricCardGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className={`grid gap-4 md:grid-cols-2 lg:grid-cols-${count}`}>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="overflow-hidden border-none shadow-md">
          <CardHeader className="pb-2">
            <Skeleton className="h-4 w-1/3" animation="pulse" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-8 w-1/2 mb-2" animation="shimmer" />
            <Skeleton className="h-3 w-1/3" animation="pulse" />
            <Skeleton className="absolute right-3 top-3 h-4 w-4 opacity-10" animation="pulse" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function DashboardCompositeSkeleton() {
  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-6">
        <Card className="h-[350px] border-none shadow-sm">
          <CardHeader>
            <Skeleton className="h-6 w-1/4" animation="pulse" />
          </CardHeader>
          <CardContent className="h-[250px] flex items-end gap-2">
            {Array.from({ length: 14 }).map((_, i) => (
              <Skeleton key={i} className="w-full bg-muted/50" animation="shimmer" style={{ height: `${Math.random() * 60 + 20}%` }} />
            ))}
          </CardContent>
        </Card>
      </div>
      <div className="space-y-6">
        <Card className="h-[400px] border-none shadow-sm">
          <CardHeader>
            <Skeleton className="h-6 w-1/2" animation="pulse" />
          </CardHeader>
          <CardContent className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex gap-4">
                <Skeleton className="h-10 w-10 shrink-0 rounded-lg" animation="pulse" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" animation="pulse" />
                  <Skeleton className="h-3 w-full" animation="shimmer" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function ProjectSummarySkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i} className="border-none shadow-sm opacity-50">
          <CardHeader className="pb-3">
            <Skeleton className="h-3 w-1/4 mb-2" animation="pulse" />
            <Skeleton className="h-8 w-1/2" animation="shimmer" />
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}

export function QuickActionsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-4 rounded-xl border border-dashed">
          <Skeleton className="h-10 w-10 rounded-lg" animation="pulse" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-4 w-1/2" animation="pulse" />
            <Skeleton className="h-3 w-3/4" animation="shimmer" />
          </div>
        </div>
      ))}
    </div>
  );
}

