import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';

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
    case 'help':
      return <SyntaxHelp />;
  }
}

/**
 * A tool's result, as a sheet over the notebook: the app column's width, above the
 * tab bar. Focus moves to it when it opens.
 */
export function ToolPanel({
  id,
  onClose,
  onJump,
}: {
  id: ToolId;
  onClose: () => void;
  onJump: (log: Log) => void;
}) {
  const title = toolLabel(id);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, [id]);
  const header = (
    <div className="panel-header">
      <h2 className="t-heading">{title}</h2>
      <IconButton label={`Close ${title}`} onClick={onClose}>
        <X {...ICON} />
      </IconButton>
    </div>
  );
  return (
    <aside
      ref={ref}
      tabIndex={-1}
      className="panel"
      aria-label={title}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      {header}
      <div className="panel-body">
        <Body id={id} onJump={onJump} />
      </div>
    </aside>
  );
}
