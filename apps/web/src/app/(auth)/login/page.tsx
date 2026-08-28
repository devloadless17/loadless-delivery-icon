import type { Metadata } from 'next';
import { BrandWordmark } from '@/components/brand';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-10 flex flex-col items-center gap-3 text-center">
          <BrandWordmark className="scale-110" />
          <p className="text-sm text-muted-foreground">Delivery operations, without the weight.</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
