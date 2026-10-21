import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { setCourseSlots, type CourseInfo } from '../lib/courses';
import { usePublicPrep, type DayCourseMinutes } from '../lib/history';
import { buildPlan, type ItemRow } from '../lib/planBuild';
import { supabase } from '../lib/supabase';
import { RunwayPage } from './Home';

// A share page: `#/u/<handle>`. Shows only what that person turned on in Settings.

interface ShareProfile {
  handle: string;
  display_name: string | null;
  share_level: string;
  timezone: string;
}

export function Share() {
  const { handle = '' } = useParams();
  const [state, setState] = useState<'loading' | 'missing' | 'ok'>(supabase ? 'loading' : 'missing');
  const [profile, setProfile] = useState<ShareProfile | null>(null);
  const [rows, setRows] = useState<{ items: ItemRow[]; courses: CourseInfo[] }>({ items: [], courses: [] });
  const [totals, setTotals] = useState<DayCourseMinutes[]>([]);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    (async () => {
      const { data: p } = await supabase!.rpc('share_profile', { p_handle: handle });
      const prof = p?.[0] ?? null;
      if (!alive) return;
      if (!prof) {
        setState('missing');
        return;
      }
      const { data: plan } = await supabase!.rpc('share_plan', { p_handle: handle });
      const courses = new Map<string, CourseInfo>();
      const items: ItemRow[] = (plan ?? []).map((r) => {
        const code = r.course ?? 'General';
        if (r.course && !courses.has(code))
          courses.set(code, { id: code, code, name: null, color: r.color ?? 6, hidden: false });
        return {
          id: r.id,
          course_id: r.course ? code : null,
          kind: r.kind,
          title: r.title,
          start_at: r.start_at,
          end_at: r.end_at,
          location: r.location,
          weight: r.weight,
          take_home: r.take_home,
        };
      });
      let t: DayCourseMinutes[] = [];
      if (prof.share_level === 'totals') {
        const { data } = await supabase!.rpc('public_daily_totals', { p_handle: handle, days: 366 });
        t = (data ?? []).map((r) => ({ day: r.day, course: r.course, minutes: r.minutes }));
      }
      if (!alive) return;
      setProfile(prof);
      setRows({ items, courses: [...courses.values()] });
      setTotals(t);
      setState('ok');
    })();
    return () => {
      alive = false;
    };
  }, [handle]);

  const data = useMemo(() => {
    setCourseSlots(rows.courses);
    return buildPlan(rows.items, rows.courses, profile?.timezone ?? 'UTC');
  }, [rows, profile?.timezone]);
  const readiness = profile?.share_level === 'totals' || profile?.share_level === 'readiness';
  const prep = usePublicPrep(readiness ? handle : null, data.exam_prep);

  if (state === 'loading') return <div className="fx fx-loading" aria-busy="true" />;
  if (state === 'missing')
    return (
      <section className="empty">
        <h1 className="fx-h">Nothing here.</h1>
        <p>There's no shared runway at this address. Sharing is off by default, so this may be on purpose.</p>
        <p>
          <Link to="/">Back to Runway</Link>
        </p>
      </section>
    );
  const name = profile!.display_name || profile!.handle;
  return (
    <RunwayPage
      data={data}
      sessions={[]}
      totals={totals}
      live={null}
      prep={prep}
      title={`${name}'s runway`}
      empty={<p className="mc-note">Nothing on the runway right now.</p>}
      foot={
        <>
          Shared by {name}.{' '}
          {profile!.share_level === 'totals'
            ? 'Daily totals and readiness are shown.'
            : profile!.share_level === 'readiness'
              ? 'Exam readiness is shown.'
              : 'Only the plan is shown.'}{' '}
          <Link to="/">Make your own runway.</Link>
        </>
      }
    />
  );
}
