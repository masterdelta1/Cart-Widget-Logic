import { useGetCurrentUser, useUpdateStore, getGetCurrentUserQueryKey } from "@workspace/api-client-react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Loader2, Copy, CheckCircle2 } from "lucide-react"
import { useState, useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter
} from "@/components/ui/card"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription
} from "@/components/ui/form"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"

const settingsSchema = z.object({
  whatsapp_number: z.string().min(1, { message: "WhatsApp number is required." }),
  sms_number: z.string().optional().nullable(),
  mode: z.enum(["personalized", "discount"]),
  discount_amount: z.coerce.number().optional().nullable(),
})

export default function Settings() {
  const { data: store, isLoading } = useGetCurrentUser()
  const updateStore = useUpdateStore()
  const queryClient = useQueryClient()
  const [copied, setCopied] = useState(false)

  const form = useForm<z.infer<typeof settingsSchema>>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      whatsapp_number: "",
      sms_number: "",
      mode: "personalized",
      discount_amount: null,
    },
  })

  // Watch mode to conditionally render discount_amount
  const mode = useWatch({
    control: form.control,
    name: "mode",
  })

  useEffect(() => {
    if (store) {
      form.reset({
        whatsapp_number: store.whatsapp_number || "",
        sms_number: store.sms_number || "",
        mode: store.mode,
        discount_amount: store.discount_amount,
      })
    }
  }, [store, form])

  const onSubmit = (values: z.infer<typeof settingsSchema>) => {
    if (!store?.id) return

    // Clean up empty strings to null
    const payload = {
      ...values,
      sms_number: values.sms_number === "" ? null : values.sms_number,
      discount_amount: values.mode === "discount" ? values.discount_amount : null
    }

    updateStore.mutate(
      { id: store.id, data: payload },
      {
        onSuccess: (updatedStore) => {
          toast.success("Settings saved successfully")
          // Patch cache directly instead of invalidating to prevent jumping/flickering
          queryClient.setQueryData(getGetCurrentUserQueryKey(), updatedStore)
        },
        onError: () => {
          toast.error("Failed to save settings. Please try again.")
        }
      }
    )
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "https://example.com"
  const snippet = store ? `<script src="${origin}/widget.js" data-store-id="${store.id}"></script>` : ""

  const copyToClipboard = () => {
    navigator.clipboard.writeText(snippet)
    setCopied(true)
    toast.success("Snippet copied to clipboard")
    setTimeout(() => setCopied(false), 2000)
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-[200px] w-full" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      <div>
        <h2 className="text-3xl font-serif font-semibold text-foreground tracking-tight">Store Settings</h2>
        <p className="text-muted-foreground mt-1">Configure your recovery channels and install the widget.</p>
      </div>

      <Card className="border-primary/20 shadow-sm overflow-hidden">
        <div className="bg-primary/5 border-b px-6 py-4 flex items-center justify-between">
           <div>
             <h3 className="font-semibold font-serif text-lg text-primary">Installation</h3>
             <p className="text-sm text-primary/70">Add the widget to your Shopify store.</p>
           </div>
        </div>
        <CardContent className="p-6 space-y-6">
          <div className="grid gap-6 md:grid-cols-[1fr_300px]">
            <div className="space-y-4">
              <h4 className="font-medium text-sm text-foreground uppercase tracking-wide">Instructions</h4>
              <ol className="list-decimal list-inside space-y-3 text-sm text-muted-foreground ml-1">
                <li>Go to your Shopify Admin and navigate to <strong>Online Store &gt; Themes</strong>.</li>
                <li>Click <strong>Edit code</strong> on your active theme.</li>
                <li>Open <strong>theme.liquid</strong> and paste the snippet below just before the closing <code>&lt;/body&gt;</code> tag, then save.</li>
              </ol>
            </div>
            
            <div className="bg-secondary/50 rounded-lg p-4 border flex flex-col justify-center gap-3">
               <div className="relative group">
                 <div className="bg-background border rounded font-mono text-xs p-3 overflow-x-auto text-muted-foreground leading-relaxed whitespace-pre-wrap break-all h-[100px] flex items-center">
                   {snippet}
                 </div>
                 <Button 
                   size="sm" 
                   className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity" 
                   variant="secondary"
                   onClick={copyToClipboard}
                 >
                   {copied ? <CheckCircle2 className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                   {copied ? "Copied" : "Copy"}
                 </Button>
               </div>
               <Button 
                   className="w-full md:hidden" 
                   variant="outline"
                   onClick={copyToClipboard}
                 >
                   {copied ? <CheckCircle2 className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                   {copied ? "Copied" : "Copy Snippet"}
               </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardHeader>
              <CardTitle>Nudge Configuration</CardTitle>
              <CardDescription>
                Set up how and where shoppers will be contacted when they abandon a cart.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="whatsapp_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>WhatsApp Number (Required)</FormLabel>
                      <FormControl>
                        <Input placeholder="+1234567890" {...field} />
                      </FormControl>
                      <FormDescription>Include country code (e.g. +1)</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="sms_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>SMS Number (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="+1234567890" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormDescription>Fallback channel if WhatsApp fails</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="pt-4 border-t">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="mode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Recovery Strategy</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a mode" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="personalized">Personalized Message (High Touch)</SelectItem>
                            <SelectItem value="discount">Discount Code (High Conversion)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Choose how you want to approach the shopper.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {mode === "discount" && (
                    <FormField
                      control={form.control}
                      name="discount_amount"
                      render={({ field }) => (
                        <FormItem className="animate-in fade-in slide-in-from-top-2">
                          <FormLabel>Discount Amount ({store?.currency || "USD"})</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              placeholder="10" 
                              {...field} 
                              value={field.value || ""} 
                            />
                          </FormControl>
                          <FormDescription>
                            The flat amount offered to return to cart.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>
              </div>

            </CardContent>
            <CardFooter className="bg-muted/30 border-t px-6 py-4 flex justify-end">
              <Button type="submit" disabled={updateStore.isPending || !form.formState.isDirty}>
                {updateStore.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Save Configuration
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </div>
  )
}
