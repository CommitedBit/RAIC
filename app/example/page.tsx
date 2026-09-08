'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/hooks/use-i18n';
import {
  clearClassroomLaunchContext,
  getHomePathForLaunchMode,
  writeClassroomLaunchContext,
} from '@/lib/utils/classroom-launch';
import { EXAMPLE_COURSE_ID, ensureOpenRaicExampleSeeded } from '@/lib/utils/example-classroom-seed';

export default function ExampleClassroomPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const open = async () => {
      try {
        await ensureOpenRaicExampleSeeded();
        if (!active) return;

        clearClassroomLaunchContext();
        writeClassroomLaunchContext({
          classroomId: EXAMPLE_COURSE_ID,
          launchMode: 'public-demo',
          homePath: getHomePathForLaunchMode('public-demo'),
        });
        router.push(`/classroom/${EXAMPLE_COURSE_ID}`);
      } catch (err) {
        if (!active) return;
        const message = err instanceof Error ? err.message : t('classroom.demo.openFailed');
        setError(message);
      }
    };

    void open();

    return () => {
      active = false;
    };
  }, [router, t]);

  if (error) {
    return (
      <main className="min-h-[100dvh] grid place-items-center bg-slate-50 dark:bg-slate-950 px-4">
        <div className="max-w-2xl rounded-lg border border-destructive/30 bg-white dark:bg-slate-900 p-4 shadow">
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
          <Button
            type="button"
            className="mt-3"
            onClick={() => {
              window.location.href = '/';
            }}
            variant="outline"
          >
            {t('classroom.demo.backHome')}
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] grid place-items-center bg-slate-50 dark:bg-slate-950 px-4">
      <p className="text-sm text-muted-foreground" data-testid="example-loading-text">
        {t('classroom.demo.preparing')}
      </p>
    </main>
  );
}
