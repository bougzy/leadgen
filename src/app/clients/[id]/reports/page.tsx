'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  getAccount,
  getClientReportsByAccount,
  getClientReport,
  addClientReport,
  updateClientReport,
} from '@/lib/db';
import { generateId } from '@/lib/utils';
import type { ClientReport, ClientReportMetrics, Account } from '@/types';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useToast } from '@/components/ui/Toast';

export default function ClientReportsPage() {
  const params = useParams();
  const { addToast } = useToast();
  const clientId = params.id as string;

  const [client, setClient] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [reports, setReports] = useState<ClientReport[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [activeReport, setActiveReport] = useState<ClientReport | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [clientData, reportsData] = await Promise.all([
        getAccount(clientId),
        getClientReportsByAccount(clientId),
      ]);
      setClient(clientData ?? null);
      setReports(reportsData);

      // Check if there's already a report for the selected month
      const existing = reportsData.find((r) => r.month === selectedMonth);
      if (existing) setActiveReport(existing);
    } catch (err) {
      console.error('Failed to load report data:', err);
      addToast('Failed to load data', 'error');
    } finally {
      setLoading(false);
    }
  }, [clientId, selectedMonth, addToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // When selectedMonth changes, check for existing report
  useEffect(() => {
    const existing = reports.find((r) => r.month === selectedMonth);
    setActiveReport(existing ?? null);
  }, [selectedMonth, reports]);

  const changeMonth = (direction: -1 | 1) => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const d = new Date(year, month - 1 + direction, 1);
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const handleGenerateReport = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: clientId, month: selectedMonth }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to generate report');
      }

      const { metrics, summary } = await res.json() as { metrics: ClientReportMetrics; summary: string };

      const existingReport = reports.find((r) => r.month === selectedMonth);

      if (existingReport) {
        const updated: ClientReport = {
          ...existingReport,
          metrics,
          summary,
          generatedAt: new Date().toISOString(),
        };
        await updateClientReport(updated);
        setActiveReport(updated);
        setReports((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
        addToast('Report updated', 'success');
      } else {
        const newReport: ClientReport = {
          id: generateId(),
          accountId: clientId,
          month: selectedMonth,
          metrics,
          summary,
          generatedAt: new Date().toISOString(),
        };
        await addClientReport(newReport);
        setActiveReport(newReport);
        setReports((prev) => [...prev, newReport]);
        addToast('Report generated', 'success');
      }
    } catch (err) {
      console.error('Report generation failed:', err);
      addToast(err instanceof Error ? err.message : 'Report generation failed', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const formatMonth = (m: string) => {
    const [year, month] = m.split('-').map(Number);
    return new Date(year, month - 1).toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
  };

  if (loading) return <LoadingSpinner />;
  if (!client) return <div className="p-6 text-center text-gray-500 dark:text-gray-400">Client not found.</div>;

  return (
    <div className="space-y-6">
      {/* Print-specific styles */}
      <style jsx global>{`
        @media print {
          body * { visibility: hidden; }
          #report-printable, #report-printable * { visibility: visible; }
          #report-printable { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* Header & Month Selector */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 no-print">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Monthly Reports</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">{client.businessName}</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => changeMonth(-1)}
            className="p-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
          >
            &#8592;
          </button>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
          />
          <button
            onClick={() => changeMonth(1)}
            className="p-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
          >
            &#8594;
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleGenerateReport}
            disabled={generating}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
          >
            {generating ? 'Generating...' : activeReport ? 'Regenerate Report' : 'Generate Report'}
          </button>
          {activeReport && (
            <button
              onClick={handlePrint}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-medium"
            >
              Print Report
            </button>
          )}
        </div>
      </div>

      {/* Report Content */}
      {activeReport ? (
        <div id="report-printable" className="space-y-6">
          {/* Report Title (visible in print) */}
          <div className="hidden print:block text-center mb-8">
            <h1 className="text-2xl font-bold">{client.businessName} — Monthly Report</h1>
            <p className="text-gray-500">{formatMonth(activeReport.month)}</p>
          </div>

          {/* Metrics Card Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            <MetricCard label="New Reviews" value={activeReport.metrics.newReviews} />
            <MetricCard
              label="Avg Rating Change"
              value={activeReport.metrics.averageRatingChange > 0 ? `+${activeReport.metrics.averageRatingChange.toFixed(2)}` : activeReport.metrics.averageRatingChange.toFixed(2)}
              color={activeReport.metrics.averageRatingChange >= 0 ? 'green' : 'red'}
            />
            <MetricCard label="Emails Sent" value={activeReport.metrics.emailsSent} />
            <MetricCard label="Leads Generated" value={activeReport.metrics.leadsGenerated} />
            <MetricCard label="Social Posts Published" value={activeReport.metrics.socialPostsPublished} />
            <MetricCard label="Citations Fixed" value={activeReport.metrics.citationsFixed} />
            <MetricCard label="Referrals Generated" value={activeReport.metrics.referralsGenerated} />
            <MetricCard label="Reminders Sent" value={activeReport.metrics.retentionRemindersSent} />
            <MetricCard label="Review Requests Sent" value={activeReport.metrics.reviewRequestsSent} />
          </div>

          {/* Ranking Movements Table */}
          {activeReport.metrics.rankingMovements.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Ranking Movements</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-750">
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Keyword</th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Previous</th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Current</th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Change</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {activeReport.metrics.rankingMovements.map((rm, i) => {
                      const change = rm.previousPosition != null && rm.currentPosition != null
                        ? rm.previousPosition - rm.currentPosition
                        : null;
                      return (
                        <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-750">
                          <td className="px-6 py-3 text-gray-900 dark:text-white font-medium">{rm.keyword}</td>
                          <td className="px-6 py-3 text-center text-gray-600 dark:text-gray-300">
                            {rm.previousPosition ?? '—'}
                          </td>
                          <td className="px-6 py-3 text-center text-gray-600 dark:text-gray-300">
                            {rm.currentPosition ?? '—'}
                          </td>
                          <td className="px-6 py-3 text-center">
                            {change != null ? (
                              <span className={`font-semibold ${change > 0 ? 'text-green-600 dark:text-green-400' : change < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-500'}`}>
                                {change > 0 ? `+${change}` : change === 0 ? '—' : change}
                              </span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Summary */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Summary</h3>
            <p className="text-gray-700 dark:text-gray-300">{activeReport.summary}</p>
            <p className="text-xs text-gray-400 mt-4">
              Generated on {new Date(activeReport.generatedAt).toLocaleString()}
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center">
          <p className="text-gray-500 dark:text-gray-400 text-lg mb-2">No report for {formatMonth(selectedMonth)}</p>
          <p className="text-gray-400 dark:text-gray-500 text-sm">
            Click &quot;Generate Report&quot; to create a report for this month.
          </p>
        </div>
      )}

      {/* Report History */}
      {reports.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden no-print">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Report History</h3>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {reports
              .sort((a, b) => b.month.localeCompare(a.month))
              .map((report) => (
                <button
                  key={report.id}
                  onClick={() => setSelectedMonth(report.month)}
                  className={`w-full px-6 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-750 text-left transition-colors ${
                    report.month === selectedMonth ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                  }`}
                >
                  <span className="font-medium text-gray-900 dark:text-white">{formatMonth(report.month)}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Generated {new Date(report.generatedAt).toLocaleDateString()}
                  </span>
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, color }: { label: string; value: string | number; color?: 'green' | 'red' }) {
  const colorClasses =
    color === 'green'
      ? 'text-green-600 dark:text-green-400'
      : color === 'red'
        ? 'text-red-600 dark:text-red-400'
        : 'text-gray-900 dark:text-white';

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-bold ${colorClasses}`}>{value}</p>
    </div>
  );
}
