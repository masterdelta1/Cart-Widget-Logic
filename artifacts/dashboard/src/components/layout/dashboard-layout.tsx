import { useLocation } from "wouter"
import { useGetCurrentUser, useLogout } from "@workspace/api-client-react"
import { Link } from "wouter"
import { Settings, LogOut, Inbox, ExternalLink, Menu, X, Loader2 } from "lucide-react"
import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation()
  const { data: user, isLoading, isError } = useGetCurrentUser()
  const logout = useLogout()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  useEffect(() => {
    if (!isLoading && (isError || !user)) {
      setLocation("/login")
    }
  }, [isLoading, isError, user, setLocation])

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (isError || !user) {
    return null
  }

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        setLocation("/login")
      }
    })
  }

  const navItems = [
    { name: "Settings", path: "/settings", icon: Settings },
    { name: "Captures", path: "/captures", icon: Inbox },
  ]

  const SidebarContent = () => (
    <div className="flex h-full flex-col bg-card border-r">
      <div className="flex h-16 items-center px-6 border-b">
        <h1 className="font-serif text-xl font-medium tracking-tight text-foreground flex items-center gap-2">
          <div className="h-6 w-6 rounded-md bg-primary flex items-center justify-center">
            <div className="h-3 w-3 rounded-full bg-primary-foreground" />
          </div>
          Cart to WhatsApp
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto py-6 px-4">
        <div className="space-y-1">
          {navItems.map((item) => {
            const isActive = location === item.path
            return (
              <Link key={item.path} href={item.path}>
                <div
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.name}
                </div>
              </Link>
            )
          })}
        </div>
      </div>

      <div className="p-4 border-t">
        <div className="mb-4 px-3 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Store</span>
          <span className="text-sm font-medium truncate" title={user.store_domain}>
            {user.store_domain}
          </span>
        </div>
        <Button 
          variant="ghost" 
          className="w-full justify-start text-muted-foreground hover:text-foreground"
          onClick={handleLogout}
          disabled={logout.isPending}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign Out
        </Button>
      </div>
    </div>
  )

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      {/* Desktop Sidebar */}
      <div className="hidden md:block w-64 h-full shrink-0">
        <SidebarContent />
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)} />
          <div className="relative w-64 h-full bg-card shadow-xl flex flex-col">
            <button 
              className="absolute top-4 right-4 p-2 text-muted-foreground"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarContent />
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Mobile Header */}
        <div className="md:hidden flex h-16 items-center justify-between px-4 border-b bg-card">
          <h1 className="font-serif text-lg font-medium text-foreground">
            Cart to WhatsApp
          </h1>
          <button 
            className="p-2 text-muted-foreground"
            onClick={() => setIsMobileMenuOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>

        <main className="flex-1 overflow-y-auto p-4 md:p-8 lg:p-12">
          <div className="mx-auto max-w-4xl h-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
