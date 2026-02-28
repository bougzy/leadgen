'use client';

import { useState, useEffect } from 'react';
import { getAllAccounts, getAllEmails } from '@/lib/db';
import { computeDashboardAnalytics, computeConversionFunnel, computeEmailPerformance } from '@/lib/analytics';
import type { DashboardAnalytics } from '@/types';

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null);
  const [funnel, setFunnel] = useState<{ stage: string; count: number; percentage: number }[]>([]);
  const [emailPerf, setEmailPerf] = useState<{ totalSent: number; openRate: number; clickRate: number; replyRate: number; bounceRate: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [accounts, emails] = await Promise.all([getAllAccounts(), getAllEmails()]);
        const dash = computeDashboardAnalytics(accounts, emails);
        setAnalytics(dash);
        setFunnel(computeConversionFunnel(accounts));
        setEmailPerf(computeEmailPerformance(emails));
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return <div className="text-center py-12 text-gray-500 dark:text-gray-400">Computing analytics...</div>;
  }

  if (!analytics) {
    return <div className="text-center py-12 text-gray-500 dark:text-gray-400">Failed to load analytics</div>;
  }

  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Analytics</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Performance metrics and conversion analytics
          <span className="ml-2 text-xs">Last computed: {new Date(analytics.computedAt).toLocaleTimeString()}</span>
        </p>
      </div>

      {/* Top-level KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Accounts" value={analytics.totalAccounts} />
        <StatCard label="Conversion Rate" value={pct(analytics.conversionRate)} color="text-green-600 dark:text-green-400" />
        <StatCard label="Avg Lead Score" value={Math.round(analytics.avgLeadScore)} />
        <StatCard label="Pipeline Value" value={`$${analytics.pipelineValue.toLocaleString()}/mo`} color="text-blue-600 dark:text-blue-400" />
      </div>

      {/* Email metrics */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Email Performance</h2>
        {emailPerf && emailPerf.totalSent > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <MetricCard label="Sent" value={emailPerf.totalSent} />
            <MetricCard label="Open Rate" value={pct(emailPerf.openRate)} color="text-blue-600 dark:text-blue-400" />
            <MetricCard label="Click Rate" value={pct(emailPerf.clickRate)} color="text-indigo-600 dark:text-indigo-400" />
            <MetricCard label="Reply Rate" value={pct(emailPerf.replyRate)} color="text-green-600 dark:text-green-400" />
            <MetricCard label="Bounce Rate" value={pct(emailPerf.bounceRate)} color="text-red-600 dark:text-red-400" />
          </div>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">No emails sent yet</p>
        )}
      </div>

      {/* Conversion funnel */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Conversion Funnel</h2>
        <div className="space-y-3">
          {funnel.map((step) => (
            <div key={step.stage} className="flex items-center gap-4">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 w-28 capitalize">{step.stage.replace('_', ' ')}</span>
              <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-6 overflow-hidden">
                <div
                  className="bg-blue-500 dark:bg-blue-600 h-full rounded-full transition-all duration-500 flex items-center justify-end pr-2"
                  style={{ width: `${Math.max(step.percentage, 2)}%` }}
                >
                  {step.percentage > 8 && (
                    <span className="text-xs text-white font-medium">{step.count}</span>
                  )}
                </div>
              </div>
              <span className="text-sm text-gray-500 dark:text-gray-400 w-16 text-right">{step.percentage}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Top industries */}
      {analytics.topIndustries.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Top Industries</h2>
          <div className="space-y-2">
            {analytics.topIndustries.map((ind) => (
              <div key={ind.industry} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
                <span className="text-sm text-gray-700 dark:text-gray-300">{ind.industry}</span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">{ind.count} accounts</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stage breakdown */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Lifecycle Stage Breakdown</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries(analytics.byStage).map(([stage, count]) => (
            <div key={stage} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{stage.replace('_', ' ')}</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">{count}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color || 'text-gray-900 dark:text-white'}`}>{value}</p>
    </div>
  );
}

function MetricCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="text-center">
      <p className={`text-xl font-bold ${color || 'text-gray-900 dark:text-white'}`}>{value}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{label}</p>
    </div>
  );
}
