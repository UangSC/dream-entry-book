import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

/** 预先准备真实下载链接，点击时保留浏览器的用户操作上下文。 */
export function BookDownload({ archive, name, className = 'text-button', children }: {
  archive: Blob | Uint8Array;
  name: string;
  className?: string;
  children: ReactNode;
}) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const blob = archive instanceof Blob ? archive : new Blob([archive.slice().buffer as ArrayBuffer], { type: 'application/zip' });
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [archive]);
  return <a className={className} href={url || undefined} download={name} aria-disabled={!url}>{children}</a>;
}
