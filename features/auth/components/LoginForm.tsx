'use client';

import { useState, useTransition } from 'react';
import { loginAction } from '@/features/auth/api/actions';
import { ClipboardList, Loader2 } from 'lucide-react';

export default function LoginForm() {
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError('');
    startTransition(async () => {
      const result = await loginAction(formData);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 justify-center mb-8">
          <ClipboardList size={22} className="text-accent" />
          <span className="text-text-primary font-semibold text-lg">야장관리자</span>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-surface border border-border rounded-xl p-6 space-y-4"
        >
          <div>
            <label htmlFor="email" className="block text-xs text-text-secondary mb-1.5">
              이메일
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder-text-secondary/60 focus:outline-none focus:border-accent transition-colors"
              placeholder="admin@example.com"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-xs text-text-secondary mb-1.5">
              비밀번호
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder-text-secondary/60 focus:outline-none focus:border-accent transition-colors"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-xs text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full flex items-center justify-center gap-2 bg-accent text-white dark:text-zinc-950 font-semibold text-sm rounded-lg py-2.5 hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {isPending && <Loader2 size={15} className="animate-spin" />}
            로그인
          </button>
        </form>
      </div>
    </div>
  );
}
