import { useLocation } from "wouter"
import { getGetCurrentUserQueryKey, useGetCurrentUser } from "@workspace/api-client-react"
import { useEffect } from "react"
import { Loader2 } from "lucide-react"

export function AuthLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation()
  const { data: user, isLoading } = useGetCurrentUser({
    query: { queryKey: getGetCurrentUserQueryKey(), retry: false },
  })

  useEffect(() => {
    if (!isLoading && user && location !== "/settings") {
      setLocation("/settings")
    }
  }, [isLoading, user, location])

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (user) {
    return null
  }

  return (
    <div className="flex min-h-screen w-full bg-background relative overflow-hidden selection:bg-primary/20">
      <div className="flex flex-1 flex-col justify-center px-4 py-12 sm:px-6 lg:flex-none lg:px-20 xl:px-24 z-10 relative">
        <div className="mx-auto w-full max-w-sm lg:w-96">
          <div className="mb-8">
            <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center mb-6 shadow-sm">
              <div className="h-4 w-4 rounded-full bg-primary-foreground" />
            </div>
            <h2 className="text-3xl font-serif font-medium tracking-tight text-foreground">
              Recover lost sales automatically.
            </h2>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              Sign in to your dashboard to manage your Cart-to-WhatsApp widget and view recovered leads.
            </p>
          </div>
          {children}
        </div>
      </div>
      
      <div className="relative hidden w-0 flex-1 lg:block bg-secondary overflow-hidden">
        <div className="absolute inset-0 bg-primary/5" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center opacity-80 mix-blend-multiply">
           {/* Abstract visual decoration */}
           <div className="w-[30rem] h-[30rem] rounded-full border border-primary/20 absolute blur-3xl mix-blend-multiply bg-primary/10" />
           <div className="w-[20rem] h-[20rem] rounded-full border border-primary/30 absolute blur-2xl mix-blend-multiply bg-primary/20" />
        </div>
      </div>
    </div>
  )
}
