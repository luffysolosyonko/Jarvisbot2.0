/** The bot's slash commands, as buttons. */
export type ToolId =
  | 'today'
  | 'stats'
  | 'lift'
  | 'estimate'
  | 'predict-weight'
  | 'predict-lift'
  | 'volume'
  | 'charts'
  | 'search'
  | 'aliases'
  | 'export'
  | 'usage'
  | 'help';

export const TOOLS: { id: ToolId; label: string; command: string }[] = [
  { id: 'today', label: 'Today', command: '/today' },
  { id: 'stats', label: 'Stats', command: '/stats' },
  { id: 'lift', label: 'Lift', command: '/lift' },
  { id: 'estimate', label: 'Estimate', command: '/estimate' },
  { id: 'predict-weight', label: 'Predict weight', command: '/predict' },
  { id: 'predict-lift', label: 'Predict lift', command: '/predict lift' },
  { id: 'volume', label: 'Volume', command: '/volume' },
  { id: 'charts', label: 'Charts', command: '/chart' },
  { id: 'search', label: 'Search', command: '/search' },
  { id: 'aliases', label: 'Aliases', command: '/alias' },
  { id: 'export', label: 'Export', command: '/export' },
  { id: 'usage', label: 'AI usage', command: '/usage' },
];

export function toolLabel(id: ToolId): string {
  return id === 'help' ? 'Syntax help' : (TOOLS.find((t) => t.id === id)?.label ?? id);
}
