import { useGetStoreCaptures, useGetCurrentUser } from "@workspace/api-client-react"
import { format } from "date-fns"
import { Download, Loader2, MessageCircle, MessageSquare } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

export default function Captures() {
  const { data: store, isLoading: storeLoading } = useGetCurrentUser()
  const { data: captureData, isLoading: capturesLoading } = useGetStoreCaptures(store?.id || "", undefined, {
    query: {
      enabled: !!store?.id
    }
  })

  const isLoading = storeLoading || capturesLoading

  const handleExport = () => {
    if (!store?.id) return
    const origin = typeof window !== "undefined" ? window.location.origin : ""
    window.open(`${origin}/api/stores/${store.id}/captures?format=csv`, "_blank")
  }

  const renderCartSummary = (snapshot: any) => {
    if (!snapshot) return <span className="text-muted-foreground">Empty</span>
    
    // Attempt to parse standard Shopify cart properties if they exist
    if (snapshot.item_count !== undefined && snapshot.total_price !== undefined) {
      const price = (snapshot.total_price / 100).toFixed(2)
      return (
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-foreground">{snapshot.item_count} items</span>
          <span className="text-xs text-muted-foreground">{store?.currency} {price}</span>
        </div>
      )
    }

    // Fallback compact JSON preview for unknown shapes
    try {
      const keys = Object.keys(snapshot)
      if (keys.length === 0) return <span className="text-muted-foreground">Empty</span>
      return (
        <span className="text-xs font-mono text-muted-foreground truncate max-w-[200px] inline-block">
          {JSON.stringify(snapshot)}
        </span>
      )
    } catch {
      return <span className="text-muted-foreground">Invalid data</span>
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-[250px]" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    )
  }

  const captures = captureData?.captures || []
  const hasCaptures = captures.length > 0

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12 h-full flex flex-col">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-serif font-semibold text-foreground tracking-tight">Leads & Captures</h2>
          <p className="text-muted-foreground mt-1">View the shoppers who clicked your nudges to return to checkout.</p>
        </div>
        
        {hasCaptures && (
          <Button variant="outline" onClick={handleExport} className="shrink-0 bg-card">
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        )}
      </div>

      <Card className="shadow-sm flex-1 flex flex-col min-h-0 overflow-hidden">
        {hasCaptures ? (
          <div className="overflow-auto flex-1">
            <Table>
              <TableHeader className="bg-muted/50 sticky top-0 z-10">
                <TableRow>
                  <TableHead className="w-[180px]">Date</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Nudge Tier</TableHead>
                  <TableHead>Cart Summary</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {captures.map((capture) => (
                  <TableRow key={capture.id}>
                    <TableCell className="font-medium text-foreground">
                      {format(new Date(capture.created_at), "MMM d, yyyy 'at' h:mm a")}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {capture.channel === "whatsapp" ? (
                           <MessageCircle className="h-4 w-4 text-green-600" />
                        ) : (
                           <MessageSquare className="h-4 w-4 text-blue-600" />
                        )}
                        <span className="capitalize text-sm font-medium">{capture.channel}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-mono bg-secondary border-transparent">
                        Tier {capture.tier}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {renderCartSummary(capture.cart_snapshot)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-12 text-center h-full min-h-[400px]">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-6">
              <InboxIcon className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-xl font-serif font-medium text-foreground mb-2">No captures yet</h3>
            <p className="text-muted-foreground max-w-sm mb-6">
              Once shoppers abandon their carts and receive your nudges, their engagement will appear here. Ensure the widget is installed on your store.
            </p>
          </div>
        )}
      </Card>
    </div>
  )
}

function InboxIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  )
}
