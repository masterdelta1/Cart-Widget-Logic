import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useSignup } from "@workspace/api-client-react"
import { Link, useLocation } from "wouter"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form"

const signupSchema = z.object({
  owner_email: z.string().email({ message: "Please enter a valid email address." }),
  password: z.string().min(8, { message: "Password must be at least 8 characters." }),
  store_domain: z.string().trim().min(3, { message: "Website domain is required." }).refine((value) => {
    const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`
    try {
      return Boolean(new URL(candidate).hostname)
    } catch {
      return false
    }
  }, {
    message: "Enter a valid website domain or URL (e.g., example.com).",
  }),
})

export default function Signup() {
  const [, setLocation] = useLocation()
  const signupMutation = useSignup()

  const form = useForm<z.infer<typeof signupSchema>>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      owner_email: "",
      password: "",
      store_domain: "",
    },
  })

  function onSubmit(values: z.infer<typeof signupSchema>) {
    const storeDomain = values.store_domain
      .trim()
      .replace(/^https?:\/\//i, "")
      .replace(/\/+$/, "")

    signupMutation.mutate(
      { data: { ...values, store_domain: storeDomain } },
      {
        onSuccess: () => {
          toast.success("Account created successfully")
          setLocation("/settings")
        },
        onError: (error: any) => {
          const msg = error?.response?.data?.error || "Failed to create account. Please try again."
          toast.error(msg)
        },
      }
    )
  }

  return (
    <div className="space-y-6">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="owner_email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email address</FormLabel>
                <FormControl>
                  <Input placeholder="founder@brand.com" {...field} autoComplete="email" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="store_domain"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Website domain</FormLabel>
                <FormControl>
                  <Input placeholder="example.com" {...field} autoComplete="url" />
                </FormControl>
                <FormDescription>
                  Enter your custom website domain. Shopify stores can also use their `.myshopify.com` domain.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <Input type="password" placeholder="••••••••" {...field} autoComplete="new-password" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button 
            type="submit" 
            className="w-full mt-2" 
            disabled={signupMutation.isPending}
          >
            {signupMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Create Account
          </Button>
        </form>
      </Form>

      <div className="text-sm text-center text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline hover:text-primary/90">
          Sign in
        </Link>
      </div>
    </div>
  )
}
