'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { getAllLeads, getAllEmails, getAllCampaigns, getAllActivities, getTodaySendCount, getSettings } from '@/lib/db';
import { getSuggestions, getStats, getChartData, getBestSendTimes } from '@/lib/suggestions';
import { formatRelativeDate } from '@/lib/utils';
import type { Lead, Email, Campaign, ActivityItem, Suggestion } from '@/types';
import StatsCard from '@/components/ui/StatsCard';
import EmptyState from '@/components/ui/EmptyState';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell,
  BarChart, Bar,
} from 'recharts';

// ---------- Status colors for the pie chart ----------
const STATUS_COLORS: Record<string, string> = {
  new: '#3b82f6',        // blue
  contacted: '#eab308',  // yellow
  responded: '#22c55e',  // green
  qualified: '#a855f7',  // purple
  closed: '#10b981',     // emerald
  rejected: '#ef4444',   // red
};

const STATUS_LABELS: Record<string, string> = {
  new: 'New',
  contacted: 'Contacted',
  responded: 'Responded',
  qualified: 'Qualified',
  closed: 'Closed',
  rejected: 'Rejected',
};

// ---------- Shared Recharts tooltip style for dark mode ----------
const tooltipStyle = {
  backgroundColor: 'rgba(17, 24, 39, 0.95)',
  border: '1px solid rgba(75, 85, 99, 0.5)',
  borderRadius: '8px',
  color: '#f3f4f6',
  fontSize: '13px',
};

// ---------- Custom pie tooltip ----------
function PieTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; payload: { fill: string } }> }) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div style={tooltipStyle} className="px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: item.payload.fill }} />
        <span className="font-medium">{item.name}</span>
      </div>
      <div className="text-gray-300 text-xs mt-1">{item.value} lead{item.value !== 1 ? 's' : ''}</div>
    </div>
  );
}

// ---------- No data placeholder ----------
function NoDataPlaceholder({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-gray-400 dark:text-gray-500">
      <svg className="w-10 h-10 mb-2 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13h2l3-8 4 16 3-8h6" />
      </svg>
      <span className="text-sm">{label}</span>
    </div>
  );
}

// ==========================================================
// Dashboard Component
// ==========================================================

export default function Dashboard() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [emails, setEmails] = useState<Email[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [todaySent, setTodaySent] = useState(0);
  const [dailyLimit, setDailyLimit] = useState(50);

  useEffect(() => {
    async function load() {
      try {
        const [l, e, c, a] = await Promise.all([
          getAllLeads(),
          getAllEmails(),
          getAllCampaigns(),
          getAllActivities(),
        ]);
        setLeads(l);
        setEmails(e);
        setCampaigns(c);
        setActivities(a.slice(0, 10));
        setSuggestions(getSuggestions(l, c, e));
        const [sentToday, settings] = await Promise.all([getTodaySendCount(), getSettings()]);
        setTodaySent(sentToday);
        setDailyLimit(settings.dailySendLimit);
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // ---------- Derived data ----------
  const stats = useMemo(() => getStats(leads, emails), [leads, emails]);
  const chartData = useMemo(() => getChartData(emails, 30), [emails]);
  const bestSendTimes = useMemo(() => getBestSendTimes(emails), [emails]);

  const statusData = useMemo(() => {
    return Object.entries(stats.byStatus)
      .filter(([, count]) => count > 0)
      .map(([status, count]) => ({
        name: STATUS_LABELS[status] || status,
        value: count,
        fill: STATUS_COLORS[status] || '#6b7280',
      }));
  }, [stats.byStatus]);

  const industryData = useMemo(() => {
    const counts: Record<string, number> = {};
    leads.forEach(l => {
      const ind = l.industry || 'Other';
      counts[ind] = (counts[ind] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => ({ name, count }));
  }, [leads]);

  // Funnel data
  const funnel = useMemo(() => {
    const total = stats.total;
    const contacted = stats.byStatus.contacted + stats.byStatus.responded + stats.byStatus.qualified + stats.byStatus.closed;
    const responded = stats.byStatus.responded + stats.byStatus.qualified + stats.byStatus.closed;
    const qualified = stats.byStatus.qualified + stats.byStatus.closed;
    const closed = stats.byStatus.closed;
    return [
      { label: 'Total Leads', value: total },
      { label: 'Contacted', value: contacted },
      { label: 'Responded', value: responded },
      { label: 'Qualified', value: qualified },
      { label: 'Closed', value: closed },
    ];
  }, [stats]);

  const hasChartData = chartData.some(d => d.sent > 0 || d.responses > 0);

  if (loading) return <LoadingSpinner />;

  // ---------- Empty state ----------
  if (leads.length === 0) {
    return (
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">Welcome to LeadGen</p>
          </div>
        </div>
        <EmptyState
          icon="🚀"
          title="Get Started with LeadGen"
          description="Add your first lead to start generating personalized cold emails and tracking your outreach campaigns."
          actionLabel="Add Your First Lead"
          onAction={() => window.location.href = '/leads'}
        />
      </div>
    );
  }

  // ---------- Main dashboard ----------
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Your outreach overview</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/leads"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            + Add Lead
          </Link>
          <Link
            href="/emails"
            className="px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-sm font-medium"
          >
            Generate Email
          </Link>
        </div>
      </div>

      {/* ===== Stats Cards ===== */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatsCard label="Total Leads" value={stats.total} icon="👥" color="bg-blue-50 dark:bg-blue-900/20" />
        <StatsCard label="Contacted" value={stats.byStatus.contacted} icon="📧" color="bg-yellow-50 dark:bg-yellow-900/20" />
        <StatsCard label="Responses" value={stats.byStatus.responded} icon="💬" color="bg-green-50 dark:bg-green-900/20" />
        <StatsCard label="Closed" value={stats.byStatus.closed} icon="🎉" color="bg-purple-50 dark:bg-purple-900/20" />
        <StatsCard label="Avg Score" value={stats.avgScore} icon="⭐" color="bg-orange-50 dark:bg-orange-900/20" />
      </div>

      {/* Daily Send Progress */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900 dark:text-white">Today&apos;s Sends</span>
            <span className="text-xs text-gray-500 dark:text-gray-400">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</span>
          </div>
          <span className="text-sm font-bold text-gray-900 dark:text-white">{todaySent} / {dailyLimit}</span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
          <div
            className={`h-3 rounded-full transition-all ${todaySent >= dailyLimit ? 'bg-red-500' : todaySent >= dailyLimit * 0.8 ? 'bg-yellow-500' : 'bg-green-500'}`}
            style={{ width: `${Math.min(100, (todaySent / dailyLimit) * 100)}%` }}
          />
        </div>
        {todaySent >= dailyLimit && (
          <p className="text-xs text-red-600 dark:text-red-400 mt-1">Daily limit reached. Sending will resume tomorrow.</p>
        )}
      </div>

      {/* ===== Charts Section ===== */}

      {/* Line Chart - full width */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Emails Sent vs Responses</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Last 30 days</p>
        {hasChartData ? (
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,114,128,0.2)" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12, fill: '#9ca3af' }}
                  tickLine={false}
                  axisLine={{ stroke: 'rgba(107,114,128,0.2)' }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 12, fill: '#9ca3af' }}
                  tickLine={false}
                  axisLine={{ stroke: 'rgba(107,114,128,0.2)' }}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelStyle={{ color: '#d1d5db', marginBottom: 4 }}
                  cursor={{ stroke: 'rgba(107,114,128,0.3)' }}
                />
                <Line
                  type="monotone"
                  dataKey="sent"
                  name="Emails Sent"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 5, fill: '#3b82f6' }}
                />
                <Line
                  type="monotone"
                  dataKey="responses"
                  name="Responses"
                  stroke="#22c55e"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 5, fill: '#22c55e' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <NoDataPlaceholder label="No email data yet. Send your first email to see trends." />
        )}
      </div>

      {/* Pie + Bar side-by-side */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Pie / Donut Chart - Lead Status */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Lead Status Distribution</h2>
          {statusData.length > 0 ? (
            <div className="h-[280px] flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={3}
                    dataKey="value"
                    nameKey="name"
                    stroke="none"
                  >
                    {statusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip content={<PieTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <NoDataPlaceholder label="No leads to display." />
          )}
          {/* Legend */}
          {statusData.length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 justify-center">
              {statusData.map(s => (
                <div key={s.name} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                  <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.fill }} />
                  {s.name} ({s.value})
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bar Chart - Top Industries */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Top Industries</h2>
          {industryData.length > 0 ? (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={industryData} layout="vertical" margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,114,128,0.2)" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 12, fill: '#9ca3af' }}
                    tickLine={false}
                    axisLine={{ stroke: 'rgba(107,114,128,0.2)' }}
                    allowDecimals={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 12, fill: '#9ca3af' }}
                    tickLine={false}
                    axisLine={{ stroke: 'rgba(107,114,128,0.2)' }}
                    width={100}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelStyle={{ color: '#d1d5db', marginBottom: 4 }}
                    cursor={{ fill: 'rgba(107,114,128,0.1)' }}
                    formatter={(value) => [`${value} lead${value !== 1 ? 's' : ''}`, 'Count']}
                  />
                  <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <NoDataPlaceholder label="No industry data yet." />
          )}
        </div>
      </div>

      {/* ===== Conversion Funnel ===== */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Conversion Funnel</h2>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center overflow-x-auto gap-2 sm:gap-0">
          {funnel.map((stage, i) => {
            const prevValue = i > 0 ? funnel[i - 1].value : null;
            const dropPct = prevValue && prevValue > 0
              ? Math.round((stage.value / prevValue) * 100)
              : null;

            return (
              <div key={stage.label} className="flex flex-col sm:flex-row items-center sm:flex-shrink-0 w-full sm:w-auto">
                {/* Drop percentage arrow */}
                {i > 0 && (
                  <div className="flex flex-col items-center mx-0 sm:mx-2 min-w-[40px]">
                    <svg className="w-5 h-5 text-gray-400 dark:text-gray-500 rotate-90 sm:rotate-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 mt-0.5">
                      {dropPct !== null ? `${dropPct}%` : '--'}
                    </span>
                  </div>
                )}
                {/* Stage */}
                <div
                  className={`flex flex-col items-center justify-center rounded-lg px-5 py-4 w-full sm:w-auto sm:min-w-[110px] ${
                    i === 0
                      ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
                      : i === funnel.length - 1
                        ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800'
                        : 'bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700'
                  }`}
                >
                  <span className="text-xl font-bold text-gray-900 dark:text-white">{stage.value}</span>
                  <span className="text-xs text-gray-600 dark:text-gray-400 mt-1 whitespace-nowrap">{stage.label}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ===== A/B Test Results ===== */}
      {(() => {
        const abEmails = emails.filter(e => e.abTestGroup);
        if (abEmails.length === 0) return null;
        const groupA = abEmails.filter(e => e.abTestGroup === 'A');
        const groupB = abEmails.filter(e => e.abTestGroup === 'B');
        const calcRate = (arr: typeof abEmails, field: 'openedAt' | 'clickedAt' | 'respondedAt') =>
          arr.length > 0 ? Math.round((arr.filter(e => e[field]).length / arr.length) * 100) : 0;
        const aOpen = calcRate(groupA, 'openedAt');
        const bOpen = calcRate(groupB, 'openedAt');
        const aClick = calcRate(groupA, 'clickedAt');
        const bClick = calcRate(groupB, 'clickedAt');
        const aReply = calcRate(groupA, 'respondedAt');
        const bReply = calcRate(groupB, 'respondedAt');
        const winner = (a: number, b: number) => a > b ? 'A' : b > a ? 'B' : '-';
        return (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">A/B Test Results</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Comparing subject line variations from campaign bulk sends</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="py-2 px-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Metric</th>
                    <th className="py-2 px-3 text-center text-xs font-medium text-blue-600 dark:text-blue-400">Group A ({groupA.length} emails)</th>
                    <th className="py-2 px-3 text-center text-xs font-medium text-purple-600 dark:text-purple-400">Group B ({groupB.length} emails)</th>
                    <th className="py-2 px-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400">Winner</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Open Rate', `${aOpen}%`, `${bOpen}%`, winner(aOpen, bOpen)],
                    ['Click Rate', `${aClick}%`, `${bClick}%`, winner(aClick, bClick)],
                    ['Reply Rate', `${aReply}%`, `${bReply}%`, winner(aReply, bReply)],
                  ].map(([label, a, b, w]) => (
                    <tr key={label} className="border-b border-gray-100 dark:border-gray-800">
                      <td className="py-2.5 px-3 font-medium text-gray-900 dark:text-white">{label}</td>
                      <td className={`py-2.5 px-3 text-center ${w === 'A' ? 'text-green-600 dark:text-green-400 font-bold' : 'text-gray-600 dark:text-gray-400'}`}>{a}</td>
                      <td className={`py-2.5 px-3 text-center ${w === 'B' ? 'text-green-600 dark:text-green-400 font-bold' : 'text-gray-600 dark:text-gray-400'}`}>{b}</td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${w === 'A' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : w === 'B' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'}`}>{w}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* ===== Best Send Times ===== */}
      {bestSendTimes.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Best Send Times</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Based on your email open rate history</p>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
            {bestSendTimes.map((slot, i) => (
              <div
                key={`${slot.day}-${slot.hour}`}
                className={`rounded-lg p-3 text-center border ${
                  i === 0
                    ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                    : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                }`}
              >
                {i === 0 && (
                  <span className="text-xs font-bold text-green-700 dark:text-green-400 block mb-1">TOP PICK</span>
                )}
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{slot.day}</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">{slot.hour}</p>
                <p className={`text-lg font-bold mt-1 ${i === 0 ? 'text-green-600 dark:text-green-400' : 'text-blue-600 dark:text-blue-400'}`}>{slot.openRate}%</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">open rate</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== Suggestions + Recent Activity ===== */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Suggestions */}
        <div className="lg:col-span-2">
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Suggested Actions</h2>
            {suggestions.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-sm">No suggestions right now. Keep up the good work!</p>
            ) : (
              <div className="space-y-3">
                {suggestions.map(s => (
                  <Link
                    key={s.id}
                    href={s.action}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    <span className="text-xl">{s.icon}</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{s.text}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{s.priority} priority</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      s.priority === 'urgent' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
                      s.priority === 'high' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' :
                      s.priority === 'medium' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' :
                      'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                    }`}>{s.priority}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Recent Activity</h2>
          {activities.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-sm">No activity yet. Start by adding leads!</p>
          ) : (
            <div className="space-y-3">
              {activities.map(a => (
                <div key={a.id} className="flex items-start gap-3 text-sm">
                  <span className="text-lg mt-0.5">
                    {a.type === 'lead_added' ? '➕' :
                     a.type === 'email_sent' ? '📧' :
                     a.type === 'response_received' ? '💬' :
                     a.type === 'campaign_created' ? '📣' : '🔄'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-900 dark:text-white truncate">{a.description}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{formatRelativeDate(a.timestamp)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
