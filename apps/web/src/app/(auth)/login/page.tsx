import type { Metadata } from 'next';
import { LoginContent } from './login-content';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  return <LoginContent />;
}
