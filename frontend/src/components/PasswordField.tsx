import { useState } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';

interface PasswordFieldProps {
  value: string;
  onChange: (value: string) => void;
  newPassword?: boolean;
}

export function PasswordField({ value, onChange, newPassword = false }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <label htmlFor="auth-password" className="mb-1.5 block text-sm font-medium text-neutral-800">登录密码</label>
      <div className="relative">
        <Lock className="pointer-events-none absolute left-3 top-3 size-4 text-neutral-500" aria-hidden="true" />
        <input
          id="auth-password"
          name="password"
          type={visible ? 'text' : 'password'}
          autoComplete={newPassword ? 'new-password' : 'current-password'}
          aria-describedby={newPassword ? 'auth-password-hint' : undefined}
          required
          minLength={newPassword ? 8 : undefined}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-lg border border-neutral-300 py-2.5 pl-9 pr-12 text-sm focus:border-indigo-600 focus:outline-2 focus:outline-indigo-600/20"
        />
        <button
          type="button"
          aria-label={visible ? '隐藏密码' : '显示密码'}
          onClick={() => setVisible(!visible)}
          className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-lg text-neutral-600 hover:bg-neutral-100"
        >
          {visible ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
        </button>
      </div>
      {newPassword && <p id="auth-password-hint" className="mt-1.5 text-xs text-neutral-600">至少 8 个字符</p>}
    </div>
  );
}
