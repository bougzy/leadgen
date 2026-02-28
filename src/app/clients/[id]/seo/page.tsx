'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { RankKeyword, RankingEntry, Citation, Competitor, Account } from '@/types';
import { CITATION_DIRECTORIES } from '@/types';
import {
  getAccount,
  getRankKeywordsByAccount,
  addRankKeyword,
  updateRankKeyword,
  deleteRankKeyword,
  getCitationsByAccount,
  addCitation,
  updateCitation,
  getCompetitorsByAccount,
  addCompetitor,
  updateCompetitor,
  deleteCompetitor,
} from '@/lib/db';
import { generateId } from '@/lib/utils';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Modal from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

type TabKey = 'rankings' | 'citations' | 'competitors';

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatShortDate(d: string): string {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─────────────────────────────────────────────────────────────────
// PAGE COMPONENT
// ─────────────────────────────────────────────────────────────────
export default function LocalSeoPage() {
  const params = useParams();
  const clientId = params.id as string;
  const { addToast } = useToast();

  // Global
  const [client, setClient] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('rankings');

  // Rankings
  const [keywords, setKeywords] = useState<RankKeyword[]>([]);
  const [showKeywordModal, setShowKeywordModal] = useState(false);
  const [keywordForm, setKeywordForm] = useState({ keyword: '', location: '' });
  const [checkingKeywordId, setCheckingKeywordId] = useState<string | null>(null);
  const [selectedKeywordId, setSelectedKeywordId] = useState<string | null>(null);

  // Citations
  const [citations, setCitations] = useState<Citation[]>([]);
  const [citationsInitialized, setCitationsInitialized] = useState(false);
  const [savingCitationId, setSavingCitationId] = useState<string | null>(null);

  // Competitors
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [showCompetitorModal, setShowCompetitorModal] = useState(false);
  const [competitorForm, setCompetitorForm] = useState({
    businessName: '',
    website: '',
    gbpUrl: '',
    reviewCount: 0,
    averageRating: 0,
    photoCount: 0,
    serviceAreas: '',
    notes: '',
  });
  const [competitorSubmitting, setCompetitorSubmitting] = useState(false);

  // ─── Load data ──────────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      const [siteData, keywordData, citationData, competitorData] = await Promise.all([
        getAccount(clientId),
        getRankKeywordsByAccount(clientId),
        getCitationsByAccount(clientId),
        getCompetitorsByAccount(clientId),
      ]);
      setClient(siteData || null);
      setKeywords(keywordData);
      setCitations(citationData);
      setCompetitors(competitorData);

      // Auto-initialize citations if none exist
      if (siteData && citationData.length === 0) {
        const newCitations: Citation[] = CITATION_DIRECTORIES.map(dir => ({
          id: generateId(),
          accountId: clientId,
          directory: dir.value,
          url: '',
          nameCorrect: false,
          addressCorrect: false,
          phoneCorrect: false,
          websiteCorrect: false,
          isListed: false,
          lastChecked: new Date().toISOString(),
          notes: '',
          createdAt: new Date().toISOString(),
        }));
        for (const c of newCitations) {
          await addCitation(c);
        }
        setCitations(newCitations);
        setCitationsInitialized(true);
      } else {
        setCitationsInitialized(true);
      }
    } catch (err) {
      console.error('Failed to load SEO data', err);
      addToast('Failed to load data', 'error');
    } finally {
      setLoading(false);
    }
  }, [clientId, addToast]);

  useEffect(() => { loadData(); }, [loadData]);

  // ─── Rankings handlers ──────────────────────────────────────
  async function handleAddKeyword() {
    if (!keywordForm.keyword.trim()) {
      addToast('Keyword is required', 'error');
      return;
    }
    try {
      const kw: RankKeyword = {
        id: generateId(),
        accountId: clientId,
        keyword: keywordForm.keyword.trim(),
        location: keywordForm.location.trim() || client?.location || '',
        rankings: [],
        createdAt: new Date().toISOString(),
      };
      await addRankKeyword(kw);
      setKeywords(prev => [...prev, kw]);
      setShowKeywordModal(false);
      setKeywordForm({ keyword: '', location: '' });
      addToast('Keyword added', 'success');
    } catch {
      addToast('Failed to add keyword', 'error');
    }
  }

  async function handleCheckRank(kwId: string) {
    const kw = keywords.find(k => k.id === kwId);
    if (!kw || !client) return;
    setCheckingKeywordId(kwId);
    try {
      const res = await fetch('/api/scrape-serp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: kw.keyword, location: kw.location, clientDomain: client.website }),
      });
      if (!res.ok) throw new Error('SERP check failed');
      const data = await res.json();
      const position: number | null = data.position ?? null;
      const entry: RankingEntry = { position, checkedAt: new Date().toISOString(), url: data.url };

      const updated: RankKeyword = {
        ...kw,
        rankings: [...kw.rankings, entry],
        previousPosition: kw.currentPosition ?? undefined,
        currentPosition: position ?? undefined,
        bestPosition: position !== null
          ? (kw.bestPosition !== undefined ? Math.min(kw.bestPosition, position) : position)
          : kw.bestPosition,
        lastCheckedAt: new Date().toISOString(),
      };
      await updateRankKeyword(updated);
      setKeywords(prev => prev.map(k => k.id === kwId ? updated : k));
      addToast(`Rank checked: ${position !== null ? '#' + position : 'Not found'}`, 'success');
    } catch {
      addToast('Failed to check ranking', 'error');
    } finally {
      setCheckingKeywordId(null);
    }
  }

  async function handleDeleteKeyword(kwId: string) {
    try {
      await deleteRankKeyword(kwId);
      setKeywords(prev => prev.filter(k => k.id !== kwId));
      if (selectedKeywordId === kwId) setSelectedKeywordId(null);
      addToast('Keyword deleted', 'success');
    } catch {
      addToast('Failed to delete keyword', 'error');
    }
  }

  // Chart data for selected keyword
  const selectedKeyword = keywords.find(k => k.id === selectedKeywordId);
  const chartData = selectedKeyword?.rankings.map(r => ({
    date: formatShortDate(r.checkedAt),
    position: r.position,
  })) || [];

  // ─── Citation handlers ──────────────────────────────────────
  function updateCitationLocal(id: string, field: keyof Citation, value: unknown) {
    setCitations(prev => prev.map(c => c.id === id ? { ...c, [field]: value } as Citation : c));
  }

  async function handleSaveCitation(citationId: string) {
    const cit = citations.find(c => c.id === citationId);
    if (!cit) return;
    setSavingCitationId(citationId);
    try {
      await updateCitation({ ...cit, lastChecked: new Date().toISOString() });
      setCitations(prev => prev.map(c => c.id === citationId ? { ...c, lastChecked: new Date().toISOString() } : c));
      addToast('Citation saved', 'success');
    } catch {
      addToast('Failed to save citation', 'error');
    } finally {
      setSavingCitationId(null);
    }
  }

  // NAP consistency score
  const listedCitations = citations.filter(c => c.isListed);
  const consistentCitations = listedCitations.filter(c => c.nameCorrect && c.addressCorrect && c.phoneCorrect && c.websiteCorrect);
  const napScore = listedCitations.length > 0 ? Math.round((consistentCitations.length / listedCitations.length) * 100) : 0;

  // ─── Competitor handlers ────────────────────────────────────
  async function handleAddCompetitor() {
    if (!competitorForm.businessName.trim()) {
      addToast('Business name is required', 'error');
      return;
    }
    if (competitors.length >= 5) {
      addToast('Maximum 5 competitors allowed', 'error');
      return;
    }
    setCompetitorSubmitting(true);
    try {
      const comp: Competitor = {
        id: generateId(),
        accountId: clientId,
        businessName: competitorForm.businessName.trim(),
        website: competitorForm.website || undefined,
        gbpUrl: competitorForm.gbpUrl || undefined,
        reviewCount: competitorForm.reviewCount,
        averageRating: competitorForm.averageRating,
        photoCount: competitorForm.photoCount,
        serviceAreas: competitorForm.serviceAreas.split(',').map(s => s.trim()).filter(Boolean),
        notes: competitorForm.notes,
        lastUpdated: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };
      await addCompetitor(comp);
      setCompetitors(prev => [...prev, comp]);
      setShowCompetitorModal(false);
      setCompetitorForm({ businessName: '', website: '', gbpUrl: '', reviewCount: 0, averageRating: 0, photoCount: 0, serviceAreas: '', notes: '' });
      addToast('Competitor added', 'success');
    } catch {
      addToast('Failed to add competitor', 'error');
    } finally {
      setCompetitorSubmitting(false);
    }
  }

  async function handleDeleteCompetitor(compId: string) {
    try {
      await deleteCompetitor(compId);
      setCompetitors(prev => prev.filter(c => c.id !== compId));
      addToast('Competitor deleted', 'success');
    } catch {
      addToast('Failed to delete competitor', 'error');
    }
  }

  // Get latest audit data for comparison (from client data we have)
  // We'll use a simple approach: client's GBP data if available via the audit
  const clientReviewCount = client ? (competitors.length > 0 ? 0 : 0) : 0; // placeholder

  // ─── Render ─────────────────────────────────────────────────
  if (loading) return <LoadingSpinner />;

  if (!client) {
    return (
      <div className="p-6">
        <p className="text-gray-500 dark:text-gray-400">Client not found.</p>
        <Link href="/clients" className="text-blue-600 hover:underline mt-2 inline-block">Back to clients</Link>
      </div>
    );
  }

  const tabClasses = (key: TabKey) =>
    `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
      activeTab === key
        ? 'bg-blue-600 text-white'
        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
    }`;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <Link href={`/clients/${clientId}`} className="text-sm text-blue-600 hover:underline">
          &larr; {client.businessName}
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">Local SEO Intelligence</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button onClick={() => setActiveTab('rankings')} className={tabClasses('rankings')}>Rankings</button>
        <button onClick={() => setActiveTab('citations')} className={tabClasses('citations')}>Citations</button>
        <button onClick={() => setActiveTab('competitors')} className={tabClasses('competitors')}>Competitors</button>
      </div>

      {/* ═══════════ TAB: RANKINGS ═══════════ */}
      {activeTab === 'rankings' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Keyword Rankings</h2>
            <button
              onClick={() => { setShowKeywordModal(true); setKeywordForm({ keyword: '', location: client.location || '' }); }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
            >
              Add Keyword
            </button>
          </div>

          {/* Keyword table */}
          {keywords.length > 0 ? (
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-900">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Keyword</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Location</th>
                      <th className="px-4 py-3 text-center font-medium text-gray-600 dark:text-gray-400">Position</th>
                      <th className="px-4 py-3 text-center font-medium text-gray-600 dark:text-gray-400">Previous</th>
                      <th className="px-4 py-3 text-center font-medium text-gray-600 dark:text-gray-400">Change</th>
                      <th className="px-4 py-3 text-center font-medium text-gray-600 dark:text-gray-400">Best</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Last Checked</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {keywords.map(kw => {
                      const change = (kw.currentPosition != null && kw.previousPosition != null)
                        ? kw.previousPosition - kw.currentPosition
                        : null;
                      return (
                        <tr
                          key={kw.id}
                          className={`cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 ${selectedKeywordId === kw.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
                          onClick={() => setSelectedKeywordId(kw.id === selectedKeywordId ? null : kw.id)}
                        >
                          <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{kw.keyword}</td>
                          <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{kw.location}</td>
                          <td className="px-4 py-3 text-center">
                            {kw.currentPosition != null ? (
                              <span className="font-bold text-gray-900 dark:text-white">#{kw.currentPosition}</span>
                            ) : (
                              <span className="text-gray-400">--</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center text-gray-500 dark:text-gray-400">
                            {kw.previousPosition != null ? `#${kw.previousPosition}` : '--'}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {change !== null ? (
                              change > 0 ? (
                                <span className="text-green-600 dark:text-green-400 font-medium">&#9650; {change}</span>
                              ) : change < 0 ? (
                                <span className="text-red-600 dark:text-red-400 font-medium">&#9660; {Math.abs(change)}</span>
                              ) : (
                                <span className="text-gray-400">--</span>
                              )
                            ) : (
                              <span className="text-gray-400">--</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center text-gray-600 dark:text-gray-400">
                            {kw.bestPosition != null ? `#${kw.bestPosition}` : '--'}
                          </td>
                          <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">
                            {kw.lastCheckedAt ? formatDate(kw.lastCheckedAt) : 'Never'}
                          </td>
                          <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleCheckRank(kw.id)}
                                disabled={checkingKeywordId === kw.id}
                                className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-300 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 disabled:opacity-50"
                              >
                                {checkingKeywordId === kw.id ? 'Checking...' : 'Check Rank'}
                              </button>
                              <button
                                onClick={() => handleDeleteKeyword(kw.id)}
                                className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 dark:bg-red-900/30 dark:text-red-300 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/50"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-gray-400 dark:text-gray-500">
              <p className="text-lg">No keywords tracked yet</p>
              <p className="text-sm mt-1">Add keywords to start monitoring your search rankings.</p>
            </div>
          )}

          {/* Ranking history chart */}
          {selectedKeyword && selectedKeyword.rankings.length > 0 && (
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4">
                Position History: &ldquo;{selectedKeyword.keyword}&rdquo;
              </h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#9ca3af" />
                    <YAxis reversed domain={['dataMin', 'dataMax']} tick={{ fontSize: 12 }} stroke="#9ca3af" label={{ value: 'Position', angle: -90, position: 'insideLeft', style: { fontSize: 12, fill: '#9ca3af' } }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'var(--tooltip-bg, #fff)', borderColor: 'var(--tooltip-border, #e5e7eb)', borderRadius: '8px', fontSize: '12px' }}
                      formatter={(value: unknown) => [value != null ? `#${value}` : 'Not found', 'Position']}
                    />
                    <Line type="monotone" dataKey="position" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6', r: 4 }} connectNulls={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* ── Keyword Modal ── */}
          <Modal isOpen={showKeywordModal} onClose={() => setShowKeywordModal(false)} title="Add Keyword" size="sm">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Keyword *</label>
                <input
                  type="text"
                  value={keywordForm.keyword}
                  onChange={e => setKeywordForm(f => ({ ...f, keyword: e.target.value }))}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="e.g. plumber near me"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Location</label>
                <input
                  type="text"
                  value={keywordForm.location}
                  onChange={e => setKeywordForm(f => ({ ...f, location: e.target.value }))}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="e.g. Miami, FL"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setShowKeywordModal(false)}
                  className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddKeyword}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                >
                  Add Keyword
                </button>
              </div>
            </div>
          </Modal>
        </div>
      )}

      {/* ═══════════ TAB: CITATIONS ═══════════ */}
      {activeTab === 'citations' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Citation Management</h2>
            {/* NAP score */}
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600 dark:text-gray-400">NAP Consistency:</span>
              <span className={`text-lg font-bold ${napScore >= 80 ? 'text-green-600 dark:text-green-400' : napScore >= 50 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'}`}>
                {napScore}%
              </span>
            </div>
          </div>

          {!citationsInitialized ? (
            <LoadingSpinner />
          ) : citations.length > 0 ? (
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-900">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Directory</th>
                      <th className="px-3 py-3 text-center font-medium text-gray-600 dark:text-gray-400">Listed</th>
                      <th className="px-3 py-3 text-center font-medium text-gray-600 dark:text-gray-400">Name</th>
                      <th className="px-3 py-3 text-center font-medium text-gray-600 dark:text-gray-400">Address</th>
                      <th className="px-3 py-3 text-center font-medium text-gray-600 dark:text-gray-400">Phone</th>
                      <th className="px-3 py-3 text-center font-medium text-gray-600 dark:text-gray-400">Website</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">URL</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Notes</th>
                      <th className="px-3 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Checked</th>
                      <th className="px-3 py-3 text-right font-medium text-gray-600 dark:text-gray-400"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {citations.map(cit => {
                      const dirLabel = CITATION_DIRECTORIES.find(d => d.value === cit.directory)?.label || cit.directory;
                      return (
                        <tr key={cit.id}>
                          <td className="px-4 py-3 font-medium text-gray-900 dark:text-white whitespace-nowrap">{dirLabel}</td>
                          <td className="px-3 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={cit.isListed}
                              onChange={e => updateCitationLocal(cit.id, 'isListed', e.target.checked)}
                              className="h-4 w-4 rounded border-gray-300"
                            />
                          </td>
                          <td className="px-3 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={cit.nameCorrect}
                              onChange={e => updateCitationLocal(cit.id, 'nameCorrect', e.target.checked)}
                              className="h-4 w-4 rounded border-gray-300"
                            />
                          </td>
                          <td className="px-3 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={cit.addressCorrect}
                              onChange={e => updateCitationLocal(cit.id, 'addressCorrect', e.target.checked)}
                              className="h-4 w-4 rounded border-gray-300"
                            />
                          </td>
                          <td className="px-3 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={cit.phoneCorrect}
                              onChange={e => updateCitationLocal(cit.id, 'phoneCorrect', e.target.checked)}
                              className="h-4 w-4 rounded border-gray-300"
                            />
                          </td>
                          <td className="px-3 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={cit.websiteCorrect}
                              onChange={e => updateCitationLocal(cit.id, 'websiteCorrect', e.target.checked)}
                              className="h-4 w-4 rounded border-gray-300"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="url"
                              value={cit.url || ''}
                              onChange={e => updateCitationLocal(cit.id, 'url', e.target.value)}
                              className="w-full min-w-[160px] border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                              placeholder="https://..."
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              value={cit.notes}
                              onChange={e => updateCitationLocal(cit.id, 'notes', e.target.value)}
                              className="w-full min-w-[120px] border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                              placeholder="Notes..."
                            />
                          </td>
                          <td className="px-3 py-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                            {formatDate(cit.lastChecked)}
                          </td>
                          <td className="px-3 py-3 text-right">
                            <button
                              onClick={() => handleSaveCitation(cit.id)}
                              disabled={savingCitationId === cit.id}
                              className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-300 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 disabled:opacity-50 whitespace-nowrap"
                            >
                              {savingCitationId === cit.id ? 'Saving...' : 'Save'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-gray-400 dark:text-gray-500">
              <p className="text-lg">No citations found</p>
            </div>
          )}
        </div>
      )}

      {/* ═══════════ TAB: COMPETITORS ═══════════ */}
      {activeTab === 'competitors' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Competitor Analysis</h2>
            {competitors.length < 5 && (
              <button
                onClick={() => setShowCompetitorModal(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
              >
                Add Competitor
              </button>
            )}
          </div>

          {competitors.length > 0 ? (
            <div className="space-y-4">
              {/* Comparison table */}
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-900">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Business</th>
                        <th className="px-4 py-3 text-center font-medium text-gray-600 dark:text-gray-400">Reviews</th>
                        <th className="px-4 py-3 text-center font-medium text-gray-600 dark:text-gray-400">Rating</th>
                        <th className="px-4 py-3 text-center font-medium text-gray-600 dark:text-gray-400">Photos</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Website</th>
                        <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {/* Client row */}
                      <tr className="bg-blue-50/50 dark:bg-blue-900/10">
                        <td className="px-4 py-3">
                          <div className="font-medium text-blue-700 dark:text-blue-300">{client.businessName}</div>
                          <div className="text-xs text-blue-500 dark:text-blue-400">Your Client</div>
                        </td>
                        <td className="px-4 py-3 text-center text-gray-600 dark:text-gray-400">--</td>
                        <td className="px-4 py-3 text-center text-gray-600 dark:text-gray-400">--</td>
                        <td className="px-4 py-3 text-center text-gray-600 dark:text-gray-400">--</td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400 text-xs truncate max-w-[200px]">{client.website || '--'}</td>
                        <td className="px-4 py-3"></td>
                      </tr>
                      {/* Competitor rows */}
                      {competitors.map(comp => (
                        <tr key={comp.id}>
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-900 dark:text-white">{comp.businessName}</div>
                            {comp.serviceAreas.length > 0 && (
                              <div className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[200px]">
                                {comp.serviceAreas.join(', ')}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center font-medium text-gray-900 dark:text-white">{comp.reviewCount}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`font-medium ${comp.averageRating >= 4.5 ? 'text-green-600 dark:text-green-400' : comp.averageRating >= 4.0 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'}`}>
                              {comp.averageRating.toFixed(1)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center text-gray-900 dark:text-white">{comp.photoCount}</td>
                          <td className="px-4 py-3 text-gray-600 dark:text-gray-400 text-xs truncate max-w-[200px]">
                            {comp.website ? (
                              <a href={comp.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                                {comp.website.replace(/^https?:\/\//, '')}
                              </a>
                            ) : '--'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => handleDeleteCompetitor(comp.id)}
                              className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 dark:bg-red-900/30 dark:text-red-300 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/50"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Competitor detail cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {competitors.map(comp => (
                  <div key={comp.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="font-medium text-gray-900 dark:text-white">{comp.businessName}</h3>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-center mb-3">
                      <div>
                        <div className="text-xl font-bold text-gray-900 dark:text-white">{comp.reviewCount}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">Reviews</div>
                      </div>
                      <div>
                        <div className={`text-xl font-bold ${comp.averageRating >= 4.5 ? 'text-green-600 dark:text-green-400' : comp.averageRating >= 4.0 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'}`}>
                          {comp.averageRating.toFixed(1)}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">Rating</div>
                      </div>
                      <div>
                        <div className="text-xl font-bold text-gray-900 dark:text-white">{comp.photoCount}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">Photos</div>
                      </div>
                    </div>
                    {comp.serviceAreas.length > 0 && (
                      <div className="mb-2">
                        <div className="flex flex-wrap gap-1">
                          {comp.serviceAreas.map((area, i) => (
                            <span key={i} className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full">{area}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {comp.notes && (
                      <p className="text-sm text-gray-500 dark:text-gray-400">{comp.notes}</p>
                    )}
                    {comp.gbpUrl && (
                      <a href={comp.gbpUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline mt-2 inline-block">
                        View GBP Profile
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-gray-400 dark:text-gray-500">
              <p className="text-lg">No competitors tracked yet</p>
              <p className="text-sm mt-1">Add up to 5 competitors to compare performance.</p>
            </div>
          )}

          {/* ── Competitor Modal ── */}
          <Modal isOpen={showCompetitorModal} onClose={() => setShowCompetitorModal(false)} title="Add Competitor" size="md">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Business Name *</label>
                <input
                  type="text"
                  value={competitorForm.businessName}
                  onChange={e => setCompetitorForm(f => ({ ...f, businessName: e.target.value }))}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="Competitor business name"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Website</label>
                  <input
                    type="url"
                    value={competitorForm.website}
                    onChange={e => setCompetitorForm(f => ({ ...f, website: e.target.value }))}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="https://..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">GBP URL</label>
                  <input
                    type="url"
                    value={competitorForm.gbpUrl}
                    onChange={e => setCompetitorForm(f => ({ ...f, gbpUrl: e.target.value }))}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="https://maps.google.com/..."
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Review Count</label>
                  <input
                    type="number" min={0}
                    value={competitorForm.reviewCount}
                    onChange={e => setCompetitorForm(f => ({ ...f, reviewCount: +e.target.value }))}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Avg Rating</label>
                  <input
                    type="number" min={0} max={5} step={0.1}
                    value={competitorForm.averageRating}
                    onChange={e => setCompetitorForm(f => ({ ...f, averageRating: +e.target.value }))}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Photo Count</label>
                  <input
                    type="number" min={0}
                    value={competitorForm.photoCount}
                    onChange={e => setCompetitorForm(f => ({ ...f, photoCount: +e.target.value }))}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Service Areas (comma-separated)</label>
                <input
                  type="text"
                  value={competitorForm.serviceAreas}
                  onChange={e => setCompetitorForm(f => ({ ...f, serviceAreas: e.target.value }))}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="Miami, Coral Gables, Doral"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
                <textarea
                  rows={3}
                  value={competitorForm.notes}
                  onChange={e => setCompetitorForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="Any notes about this competitor..."
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setShowCompetitorModal(false)}
                  className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddCompetitor}
                  disabled={competitorSubmitting}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50"
                >
                  {competitorSubmitting ? 'Adding...' : 'Add Competitor'}
                </button>
              </div>
            </div>
          </Modal>
        </div>
      )}
    </div>
  );
}
