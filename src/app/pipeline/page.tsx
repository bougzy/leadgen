'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import type { DropResult } from '@hello-pangea/dnd';
import { getAllAccounts, updateAccount, addActivity } from '@/lib/db';
import { getScoreColor, getScoreBgColor } from '@/lib/scoring';
import { createActivity, formatDate, cn } from '@/lib/utils';
import type { Account, LifecycleStage } from '@/types';
import { PipelineStage, PIPELINE_STAGES, LIFECYCLE_STAGES } from '@/types';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useToast } from '@/components/ui/Toast';

// ---------------------------------------------------------------------------
// Stage-specific header bar colors (Tailwind classes for the column header)
// ---------------------------------------------------------------------------
const STAGE_HEADER_COLORS: Record<PipelineStage, string> = {
  prospect: 'bg-gray-500',
  outreach: 'bg-blue-500',
  engaged: 'bg-yellow-500',
  meeting: 'bg-purple-500',
  proposal: 'bg-orange-500',
  won: 'bg-green-500',
  lost: 'bg-red-500',
};

const STAGE_COLUMN_BG: Record<PipelineStage, string> = {
  prospect: 'bg-gray-50 dark:bg-gray-900/40',
  outreach: 'bg-blue-50/50 dark:bg-blue-950/20',
  engaged: 'bg-yellow-50/50 dark:bg-yellow-950/20',
  meeting: 'bg-purple-50/50 dark:bg-purple-950/20',
  proposal: 'bg-orange-50/50 dark:bg-orange-950/20',
  won: 'bg-green-50 dark:bg-green-950/30 ring-1 ring-green-200 dark:ring-green-800',
  lost: 'bg-red-50 dark:bg-red-950/30 ring-1 ring-red-200 dark:ring-red-800',
};

const STAGE_DROP_HIGHLIGHT: Record<PipelineStage, string> = {
  prospect: 'ring-2 ring-gray-400 bg-gray-100 dark:bg-gray-800/60',
  outreach: 'ring-2 ring-blue-400 bg-blue-100/70 dark:bg-blue-900/40',
  engaged: 'ring-2 ring-yellow-400 bg-yellow-100/70 dark:bg-yellow-900/40',
  meeting: 'ring-2 ring-purple-400 bg-purple-100/70 dark:bg-purple-900/40',
  proposal: 'ring-2 ring-orange-400 bg-orange-100/70 dark:bg-orange-900/40',
  won: 'ring-2 ring-green-400 bg-green-100/70 dark:bg-green-900/40',
  lost: 'ring-2 ring-red-400 bg-red-100/70 dark:bg-red-900/40',
};

const STAGE_ORDER: PipelineStage[] = [
  'prospect',
  'outreach',
  'engaged',
  'meeting',
  'proposal',
  'won',
  'lost',
];

// Helpers
function stageIndex(s: PipelineStage): number {
  return STAGE_ORDER.indexOf(s);
}

function prevStage(s: PipelineStage): PipelineStage | null {
  const i = stageIndex(s);
  if (i <= 0) return null;
  return STAGE_ORDER[i - 1];
}

function nextStage(s: PipelineStage): PipelineStage | null {
  const i = stageIndex(s);
  if (i < 0 || i >= STAGE_ORDER.length - 1) return null;
  return STAGE_ORDER[i + 1];
}

function stageLabel(s: PipelineStage): string {
  return PIPELINE_STAGES.find((ps) => ps.value === s)?.label ?? s;
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

// Stage-to-lifecycle mapping
const STAGE_TO_LIFECYCLE: Record<PipelineStage, LifecycleStage> = {
  prospect: 'prospect',
  outreach: 'contacted',
  engaged: 'engaged',
  meeting: 'qualified',
  proposal: 'qualified',
  won: 'won',
  lost: 'churned',
};

// ========================= COMPONENT ========================================
export default function PipelinePage() {
  const { addToast } = useToast();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null); // account currently being moved (shows stage picker)
  const [searchQuery, setSearchQuery] = useState('');

  // ---- data loading --------------------------------------------------------
  const loadAccounts = useCallback(async () => {
    try {
      const data = await getAllAccounts();
      setAccounts(data);
    } catch (err) {
      console.error('Failed to load accounts:', err);
      addToast('Failed to load accounts', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  // ---- filter accounts by search query --------------------------------------
  const filteredAccounts = useMemo(() => {
    if (!searchQuery.trim()) return accounts;
    const q = searchQuery.toLowerCase().trim();
    return accounts.filter((account) => account.businessName.toLowerCase().includes(q));
  }, [accounts, searchQuery]);

  // ---- grouped by stage ----------------------------------------------------
  const grouped = useMemo(() => {
    const map: Record<PipelineStage, Account[]> = {
      prospect: [],
      outreach: [],
      engaged: [],
      meeting: [],
      proposal: [],
      won: [],
      lost: [],
    };
    for (const account of filteredAccounts) {
      const stage = account.pipelineStage ?? 'prospect';
      if (map[stage]) {
        map[stage].push(account);
      } else {
        map.prospect.push(account);
      }
    }
    // Sort each column by lead score descending
    for (const key of STAGE_ORDER) {
      map[key].sort((a, b) => b.leadScore - a.leadScore);
    }
    return map;
  }, [filteredAccounts]);

  // ---- stats (always computed from all accounts, not filtered) -------------
  const stats = useMemo(() => {
    const allGrouped: Record<PipelineStage, Account[]> = {
      prospect: [],
      outreach: [],
      engaged: [],
      meeting: [],
      proposal: [],
      won: [],
      lost: [],
    };
    for (const account of accounts) {
      const stage = account.pipelineStage ?? 'prospect';
      if (allGrouped[stage]) {
        allGrouped[stage].push(account);
      } else {
        allGrouped.prospect.push(account);
      }
    }
    const wonAccounts = allGrouped.won;
    const totalDealValue = wonAccounts.reduce((sum, a) => sum + (a.dealValue ?? 0), 0);
    const totalAccounts = accounts.length;
    const wonCount = wonAccounts.length;
    const lostCount = allGrouped.lost.length;
    const closedCount = wonCount + lostCount;
    const conversionRate = closedCount > 0 ? (wonCount / closedCount) * 100 : 0;
    const activeDeals = totalAccounts - wonCount - lostCount;
    return { totalDealValue, conversionRate, activeDeals, totalAccounts, wonCount };
  }, [accounts]);

  // ---- move account to a new stage ------------------------------------------
  const moveAccountToStage = useCallback(
    async (account: Account, newStage: PipelineStage) => {
      if (account.pipelineStage === newStage) return;
      const oldStage = account.pipelineStage ?? 'prospect';
      const newLifecycle = STAGE_TO_LIFECYCLE[newStage];
      const updatedAccount: Account = { ...account, pipelineStage: newStage, lifecycleStage: newLifecycle };
      // Optimistic update
      setAccounts((prev) =>
        prev.map((a) => (a.id === account.id ? updatedAccount : a))
      );
      setMovingId(null);
      try {
        await updateAccount(updatedAccount);
        const activity = createActivity(
          'lead_status_changed',
          `Moved "${account.businessName}" from ${stageLabel(oldStage)} to ${stageLabel(newStage)}`,
          account.id
        );
        await addActivity(activity);
        addToast(`Moved to ${stageLabel(newStage)}`);
      } catch (err) {
        console.error('Failed to move account:', err);
        // Revert
        setAccounts((prev) =>
          prev.map((a) => (a.id === account.id ? account : a))
        );
        addToast('Failed to move account', 'error');
      }
    },
    [addToast]
  );

  // ---- drag-and-drop handler -----------------------------------------------
  const handleDragEnd = useCallback(
    (result: DropResult) => {
      const { destination, source, draggableId } = result;

      // Dropped outside a valid droppable
      if (!destination) return;

      // Dropped back in the same position
      if (
        destination.droppableId === source.droppableId &&
        destination.index === source.index
      ) {
        return;
      }

      const newStage = destination.droppableId as PipelineStage;
      const oldStage = source.droppableId as PipelineStage;

      // If same column, just reordering -- we don't persist order, so ignore
      if (newStage === oldStage) return;

      // Find the account
      const account = accounts.find((a) => a.id === draggableId);
      if (!account) return;

      moveAccountToStage(account, newStage);
    },
    [accounts, moveAccountToStage]
  );

  // ---- render ---------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ===== Page Header ===== */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
          Pipeline
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Manage your deals across pipeline stages. Drag cards between columns or use arrows to move between stages.
        </p>
      </div>

      {/* ===== Search / Filter Bar ===== */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <svg
            className="h-4 w-4 text-gray-400 dark:text-gray-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search accounts by name..."
          className="block w-full md:w-80 pl-10 pr-10 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* ===== Stats Bar ===== */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Won Deal Value"
          value={formatCurrency(stats.totalDealValue)}
          accent="text-green-600 dark:text-green-400"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          label="Conversion Rate"
          value={`${stats.conversionRate.toFixed(1)}%`}
          accent="text-blue-600 dark:text-blue-400"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          }
        />
        <StatCard
          label="Active Deals"
          value={String(stats.activeDeals)}
          accent="text-purple-600 dark:text-purple-400"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          }
        />
        <StatCard
          label="Total Accounts"
          value={String(stats.totalAccounts)}
          accent="text-gray-600 dark:text-gray-400"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          }
        />
      </div>

      {/* ===== Kanban Board with Drag-and-Drop ===== */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex flex-col lg:flex-row gap-4 overflow-x-auto pb-4 lg:min-h-[60vh]">
          {STAGE_ORDER.map((stage) => (
            <Droppable droppableId={stage} key={stage}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={cn(
                    'flex-shrink-0 w-full lg:w-72 xl:w-80 rounded-xl overflow-hidden transition-all duration-200',
                    STAGE_COLUMN_BG[stage],
                    snapshot.isDraggingOver && STAGE_DROP_HIGHLIGHT[stage]
                  )}
                >
                  {/* Column header */}
                  <div className={cn('px-4 py-3 flex items-center justify-between', STAGE_HEADER_COLORS[stage])}>
                    <span className="text-sm font-semibold text-white truncate">
                      {stageLabel(stage)}
                    </span>
                    <span className="ml-2 flex-shrink-0 text-xs font-bold bg-white/25 text-white rounded-full px-2 py-0.5">
                      {grouped[stage].length}
                    </span>
                  </div>

                  {/* Cards */}
                  <div className="p-2 space-y-2 max-h-[calc(100vh-320px)] overflow-y-auto min-h-[60px]">
                    {grouped[stage].length === 0 && !snapshot.isDraggingOver && (
                      <p className="text-xs text-center text-gray-400 dark:text-gray-500 py-8">
                        No accounts in this stage
                      </p>
                    )}
                    {grouped[stage].map((account, index) => (
                      <Draggable
                        draggableId={account.id}
                        index={index}
                        key={account.id}
                      >
                        {(dragProvided, dragSnapshot) => (
                          <div
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            {...dragProvided.dragHandleProps}
                            style={dragProvided.draggableProps.style}
                            className={cn(
                              'transition-transform duration-150',
                              dragSnapshot.isDragging &&
                                'scale-[1.03] shadow-xl opacity-90 rotate-[1deg]'
                            )}
                          >
                            <AccountCard
                              account={account}
                              expanded={expandedId === account.id}
                              showingStagePicker={movingId === account.id}
                              isDragging={dragSnapshot.isDragging}
                              onToggleExpand={() =>
                                setExpandedId((prev) => (prev === account.id ? null : account.id))
                              }
                              onToggleStagePicker={() =>
                                setMovingId((prev) => (prev === account.id ? null : account.id))
                              }
                              onMoveForward={() => {
                                const ns = nextStage(account.pipelineStage ?? 'prospect');
                                if (ns) moveAccountToStage(account, ns);
                              }}
                              onMoveBackward={() => {
                                const ps = prevStage(account.pipelineStage ?? 'prospect');
                                if (ps) moveAccountToStage(account, ps);
                              }}
                              onMoveToStage={(s) => moveAccountToStage(account, s)}
                              currentStage={account.pipelineStage ?? 'prospect'}
                            />
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                </div>
              )}
            </Droppable>
          ))}
        </div>
      </DragDropContext>
    </div>
  );
}

// ===========================================================================
// Sub-components
// ===========================================================================

function StatCard({
  label,
  value,
  accent,
  icon,
}: {
  label: string;
  value: string;
  accent: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center gap-3">
        <div className={cn('p-2 rounded-lg bg-gray-100 dark:bg-gray-700', accent)}>
          {icon}
        </div>
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
          <p className={cn('text-lg font-bold', accent)}>{value}</p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Account Card
// ---------------------------------------------------------------------------
function AccountCard({
  account,
  expanded,
  showingStagePicker,
  isDragging,
  onToggleExpand,
  onToggleStagePicker,
  onMoveForward,
  onMoveBackward,
  onMoveToStage,
  currentStage,
}: {
  account: Account;
  expanded: boolean;
  showingStagePicker: boolean;
  isDragging: boolean;
  onToggleExpand: () => void;
  onToggleStagePicker: () => void;
  onMoveForward: () => void;
  onMoveBackward: () => void;
  onMoveToStage: (stage: PipelineStage) => void;
  currentStage: PipelineStage;
}) {
  const canMoveBack = stageIndex(currentStage) > 0;
  const canMoveForward = stageIndex(currentStage) < STAGE_ORDER.length - 1;

  return (
    <div
      className={cn(
        'bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow',
        isDragging && 'shadow-2xl border-blue-300 dark:border-blue-600'
      )}
    >
      {/* ---- Card top: clickable to expand ---- */}
      <button
        type="button"
        className="w-full text-left px-3 py-2.5 focus:outline-none"
        onClick={onToggleExpand}
      >
        {/* Row 1: name + score */}
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm font-semibold text-gray-900 dark:text-white leading-tight truncate">
            {account.businessName}
          </span>
          <span
            className={cn(
              'flex-shrink-0 text-xs font-bold px-1.5 py-0.5 rounded',
              getScoreBgColor(account.leadScore),
              getScoreColor(account.leadScore)
            )}
          >
            {account.leadScore}
          </span>
        </div>

        {/* Row 2: industry */}
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
          {account.industry}
          {account.location ? ` \u2022 ${account.location}` : ''}
        </p>

        {/* Row 3: icons + deal value */}
        <div className="flex items-center gap-2 mt-1.5">
          {account.contactEmail && (
            <span title={account.contactEmail} className="text-gray-400 dark:text-gray-500">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </span>
          )}
          {account.contactPhone && (
            <span title={account.contactPhone} className="text-gray-400 dark:text-gray-500">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </span>
          )}
          {account.dealValue != null && account.dealValue > 0 && (
            <span className="ml-auto text-xs font-semibold text-green-600 dark:text-green-400">
              {formatCurrency(account.dealValue)}
            </span>
          )}
        </div>
      </button>

      {/* ---- Arrow buttons (always visible) ---- */}
      <div className="flex items-center justify-between border-t border-gray-100 dark:border-gray-700 px-2 py-1">
        <button
          type="button"
          disabled={!canMoveBack}
          onClick={(e) => {
            e.stopPropagation();
            onMoveBackward();
          }}
          title={canMoveBack ? `Move to ${stageLabel(prevStage(currentStage)!)}` : undefined}
          className={cn(
            'p-1 rounded transition-colors',
            canMoveBack
              ? 'text-gray-500 hover:text-gray-800 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-700'
              : 'text-gray-200 dark:text-gray-700 cursor-not-allowed'
          )}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Stage picker button */}
        <div className="relative">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleStagePicker();
            }}
            title="Move to stage..."
            className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:text-white dark:hover:bg-gray-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
            </svg>
          </button>

          {/* Dropdown stage picker */}
          {showingStagePicker && (
            <div className="absolute z-30 bottom-full mb-1 left-1/2 -translate-x-1/2 w-40 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl py-1">
              {STAGE_ORDER.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={s === currentStage}
                  onClick={(e) => {
                    e.stopPropagation();
                    onMoveToStage(s);
                  }}
                  className={cn(
                    'w-full text-left px-3 py-1.5 text-xs transition-colors',
                    s === currentStage
                      ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed bg-gray-50 dark:bg-gray-900'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={cn(
                        'w-2 h-2 rounded-full flex-shrink-0',
                        STAGE_HEADER_COLORS[s]
                      )}
                    />
                    {stageLabel(s)}
                    {s === currentStage && (
                      <svg className="w-3 h-3 ml-auto text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          disabled={!canMoveForward}
          onClick={(e) => {
            e.stopPropagation();
            onMoveForward();
          }}
          title={canMoveForward ? `Move to ${stageLabel(nextStage(currentStage)!)}` : undefined}
          className={cn(
            'p-1 rounded transition-colors',
            canMoveForward
              ? 'text-gray-500 hover:text-gray-800 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-700'
              : 'text-gray-200 dark:text-gray-700 cursor-not-allowed'
          )}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* ---- Expanded details panel ---- */}
      {expanded && !isDragging && (
        <div className="border-t border-gray-100 dark:border-gray-700 px-3 py-3 text-xs space-y-2 bg-gray-50/50 dark:bg-gray-900/30">
          {/* Contact info */}
          {account.contactName && (
            <DetailRow label="Contact" value={account.contactName} />
          )}
          {account.contactEmail && (
            <DetailRow
              label="Email"
              value={
                <a
                  href={`mailto:${account.contactEmail}`}
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {account.contactEmail}
                </a>
              }
            />
          )}
          {account.contactPhone && (
            <DetailRow
              label="Phone"
              value={
                <a
                  href={`tel:${account.contactPhone}`}
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {account.contactPhone}
                </a>
              }
            />
          )}
          {account.website && (
            <DetailRow
              label="Website"
              value={
                <a
                  href={account.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:underline truncate block max-w-[180px]"
                >
                  {account.website.replace(/^https?:\/\//, '')}
                </a>
              }
            />
          )}
          {account.dealValue != null && account.dealValue > 0 && (
            <DetailRow
              label="Deal Value"
              value={
                <span className="font-semibold text-green-600 dark:text-green-400">
                  {formatCurrency(account.dealValue)}
                </span>
              }
            />
          )}

          {/* Tags */}
          {account.tags.length > 0 && (
            <div>
              <span className="text-gray-400 dark:text-gray-500 font-medium">Tags</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {account.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-block px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-[10px]"
                  >
                    {tag.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {account.notes && (
            <div>
              <span className="text-gray-400 dark:text-gray-500 font-medium">Notes</span>
              <p className="text-gray-600 dark:text-gray-300 mt-0.5 whitespace-pre-wrap">
                {account.notes}
              </p>
            </div>
          )}

          {/* Last contacted */}
          {account.lastContacted && (
            <DetailRow
              label="Last Contacted"
              value={formatDate(account.lastContacted)}
            />
          )}

          {/* Date added */}
          <DetailRow label="Added" value={formatDate(account.dateAdded)} />

          {/* Lifecycle Stage */}
          <DetailRow label="Stage" value={LIFECYCLE_STAGES.find(s => s.value === account.lifecycleStage)?.label ?? account.lifecycleStage} />

          {/* Quick actions */}
          <div className="flex gap-2 pt-2 border-t border-gray-100 dark:border-gray-700 mt-2">
            <a
              href={`/emails?accountId=${account.id}`}
              className="flex-1 text-center px-2 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 transition-colors"
            >
              Generate Email
            </a>
            <a
              href={`/leads/${account.id}`}
              className="flex-1 text-center px-2 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-xs font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              View Details
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-gray-400 dark:text-gray-500 font-medium flex-shrink-0">
        {label}
      </span>
      <span className="text-gray-700 dark:text-gray-200 text-right">
        {value}
      </span>
    </div>
  );
}
