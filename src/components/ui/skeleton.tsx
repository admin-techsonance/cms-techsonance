import { cn } from "@/lib/utils"

interface SkeletonProps extends React.ComponentProps<"div"> {
  animation?: "pulse" | "shimmer" | "none";
}

function Skeleton({ className, animation = "pulse", ...props }: SkeletonProps) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "rounded-md",
        animation === "pulse" && "bg-gray-200 dark:bg-gray-800/50 animate-pulse",
        animation === "shimmer" && "animate-shimmer",
        animation === "none" && "bg-gray-200 dark:bg-gray-800/50",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
