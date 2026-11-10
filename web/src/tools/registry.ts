/** The bot's slash commands, as buttons. */
export type ToolId =
  | 'stats'
  | 'lift'
  | 'estimate'
  | 'predict-weight'
  | 'predict-lift'
  | 'charts'
  | 'search'
  | 'help';

export const TOOLS: { id: ToolId; label: string; command: string }[] = [
  { id: 'stats', label: 'Stats', command: '/stats' },
  { id: 'lift', label: 'Lift', command: '/lift' },
  { id: 'estimate', label: 'Estimate', command: '/estimate' },
  { id: 'predict-weight', label: 'Predict weight', command: '/predict' },
  { id: 'predict-lift', label: 'Predict lift', command: '/predict lift' },
  { id: 'charts', label: 'Charts', command: '/chart' },
  { id: 'search', label: 'Search', command: '/search' },
  { id: 'help', label: 'Syntax', command: '/howto' },
];

export function toolLabel(id: ToolId): string {
  return TOOLS.find((t) => t.id === id)?.label ?? id;
}
