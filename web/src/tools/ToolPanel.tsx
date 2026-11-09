import { X } from 'lucide-react';

import { IconButton } from '@/components/Button';
import { ICON } from '@/components/icons';
import { useUnit } from '@/hooks/queries';
import type { Log } from '@/lib/types';
import { SyntaxHelp } from '@/notebook/SyntaxHelp';

import { toolLabel, type ToolId } from './registry';
import {
  AliasesTool,
  ChartsTool,
  EstimateTool,
  ExportTool,
  LiftTool,
  PredictLiftTool,
  PredictWeightTool,
  SearchTool,
  StatsTool,
  TodayTool,
  UsageTool,
  VolumeTool,
} from './ToolViews';

function Body({ id, onJump }: { id: ToolId; onJump: (log: Log) => void }) {
  const unit = useUnit();
  switch (id) {
    case 'today':
      return <TodayTool unit={unit} />;
    case 'stats':
      return <StatsTool unit={unit} />;
    case 'lift':
      return <LiftTool unit={unit} />;
    case 'estimate':
      return <EstimateTool unit={unit} />;
    case 'predict-weight':
      return <PredictWeightTool unit={unit} />;
    case 'predict-lift':
      return <PredictLiftTool unit={unit} />;
    case 'volume':
      return <VolumeTool unit={unit} />;
    case 'charts':
      return <ChartsTool unit={unit} />;
    case 'search':
      return <SearchTool unit={unit} onJump={onJump} />;
    case 'aliases':
      return <AliasesTool />;
    case 'export':
      return <ExportTool />;
    case 'usage':
      return <UsageTool />;
    case 'help':
      return <SyntaxHelp />;
  }
}

/**
 * A tool's result: a side panel on wide screens, or an inline card at the end of the
 * feed on narrow ones.
 */
export function ToolPanel({
  id,
  variant,
  onClose,
  onJump,
}: {
  id: ToolId;
  variant: 'side' | 'inline';
  onClose: () => void;
  onJump: (log: Log) => void;
}) {
  const title = toolLabel(id);
  const header = (
    <div className="panel-header">
      <h2 className="t-heading">{title}</h2>
      <IconButton label={`Close ${title}`} onClick={onClose}>
        <X {...ICON} />
      </IconButton>
    </div>
  );
  if (variant === 'side') {
    return (
      <aside className="panel" aria-label={title} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        {header}
        <div className="panel-body">
          <Body id={id} onJump={onJump} />
        </div>
      </aside>
    );
  }
  return (
    <section className="result-card" aria-label={title} style={{ marginTop: 24 }}>
      {header}
      <Body id={id} onJump={onJump} />
    </section>
  );
}
