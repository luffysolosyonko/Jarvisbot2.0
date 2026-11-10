import { ChevronLeft } from 'lucide-react';
import { Link } from 'react-router';

import { useTitle } from '@/hooks/useTitle';
import { AliasesTool } from '@/tools/ToolViews';

/**
 * Settings > Exercise names: your shortcuts (bench → Bench press) and the names the
 * parser matched on its own. The parser uses these to put sets under one exercise.
 */
export function ExerciseNamesPage() {
  useTitle('Exercise names');
  return (
    <main className="main settings" id="main">
      <Link to="/settings" className="set-back">
        <ChevronLeft size={20} strokeWidth={1.8} aria-hidden="true" />
        Settings
      </Link>
      <div className="page-header">
        <h1 className="t-title">Exercise names</h1>
      </div>
      <p className="set-caption set-intro">
        Shortcuts are swapped for the full name whenever you log, so “bench” and “bench press” count as one exercise.
      </p>
      <AliasesTool />
    </main>
  );
}
