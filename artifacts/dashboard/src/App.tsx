import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch, Router as WouterRouter, Redirect } from 'wouter';
import { Toaster } from 'sonner';

import { AuthLayout } from '@/components/layout/auth-layout';
import { DashboardLayout } from '@/components/layout/dashboard-layout';

import Login from '@/pages/login';
import Signup from '@/pages/signup';
import Settings from '@/pages/settings';
import Captures from '@/pages/captures';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <div className="text-center">
        <h1 className="text-3xl font-serif font-bold text-foreground">
          404
        </h1>
        <p className="mt-2 text-sm text-muted-foreground mb-4">
          The page you are looking for does not exist.
        </p>
        <a href="/login" className="text-primary hover:underline text-sm font-medium">
          Return Home
        </a>
      </div>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/">
        <Redirect to="/login" />
      </Route>

      <Route path="/login">
        <AuthLayout>
          <Login />
        </AuthLayout>
      </Route>

      <Route path="/signup">
        <AuthLayout>
          <Signup />
        </AuthLayout>
      </Route>

      <Route path="/settings">
        <DashboardLayout>
          <Settings />
        </DashboardLayout>
      </Route>

      <Route path="/captures">
        <DashboardLayout>
          <Captures />
        </DashboardLayout>
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <Router />
      </WouterRouter>
      <Toaster position="top-center" richColors theme="system" />
    </QueryClientProvider>
  );
}

export default App;
