'use client';

import { useEffect, useState, useCallback } from 'react';
import { getSettings, addLead, addActivity, findDuplicateLead } from '@/lib/db';
import { calculateLeadScore } from '@/lib/scoring';
import { getScoreColor, getScoreBgColor } from '@/lib/scoring';
import { generateId, createActivity } from '@/lib/utils';
import type { UserSettings, SearchResult, Lead } from '@/types';
import { INDUSTRIES } from '@/types';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';

export default function SearchPage() {
  const { addToast } = useToast();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [analyzingIds, setAnalyzingIds] = useState<Set<string>>(new Set());

  const [industry, setIndustry] = useState('Restaurant');
  const [location, setLocation] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [fromCache, setFromCache] = useState(false);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function load() {
      try {
        const s = await getSettings();
        setSettings(s);
        if (s.targetLocation) setLocation(s.targetLocation);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    }
    load();
  }, []);

  async function analyzeWebsite(result: SearchResult): Promise<SearchResult> {
    if (!result.website) {
      return { ...result, tags: [...result.tags, 'no_website'] };
    }
    try {
      const res = await fetch('/api/analyze-website', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: result.website }),
      });
      const data = await res.json();
      if (data.error) return result;

      const newTags = [...result.tags, ...data.tags];
      const emails = data.emails || [];

      return {
        ...result,
        tags: [...new Set(newTags)],
        emails: [...new Set([...result.emails, ...emails])],
        websiteAnalysis: {
          isUp: data.isUp,
          isMobile: data.isMobile,
          loadTimeMs: data.loadTimeMs,
          hasEmail: emails.length > 0,
        },
      };
    } catch {
      return result;
    }
  }

  async function handleSearch() {
    if (!settings?.googleApiKey) {
      addToast('Add your Google API key in Settings first', 'error');
      return;
    }
    if (!location.trim()) {
      addToast('Enter a location', 'error');
      return;
    }

    setSearching(true);
    setResults([]);
    setFromCache(false);
    setAddedIds(new Set());

    try {
      const res = await fetch('/api/search-businesses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: industry,
          location: location.trim(),
          apiKey: settings.googleApiKey,
        }),
      });
      const data = await res.json();

      if (data.error) {
        addToast(data.error, 'error');
        setSearching(false);
        return;
      }

      const isCached = !!data.fromCache;
      setFromCache(isCached);

      // Convert to SearchResults with initial scoring
      const initialResults: SearchResult[] = (data.results || []).map((r: { placeId: string; name: string; address: string; phone?: string; website?: string; rating?: number; reviewCount?: number; types?: string[] }) => {
        const tags: string[] = [];
        if (!r.website) tags.push('no_website');
        if (r.reviewCount !== undefined && r.reviewCount < 10) tags.push('low_reviews');

        return {
          placeId: r.placeId,
          name: r.name,
          address: r.address,
          phone: r.phone,
          website: r.website,
          rating: r.rating,
          reviewCount: r.reviewCount,
          types: r.types,
          tags,
          leadScore: 0,
          emails: [],
        };
      });

      // Calculate initial scores
      const scored = initialResults.map(r => ({
        ...r,
        leadScore: calcSearchScore(r),
      }));

      // Sort by score descending
      scored.sort((a, b) => b.leadScore - a.leadScore);
      setResults(scored);
      setSearching(false);

      addToast(isCached ? `Found ${scored.length} businesses (cached - no API cost)` : `Found ${scored.length} businesses`);

      // Analyze websites in background
      for (let i = 0; i < scored.length; i++) {
        if (scored[i].website) {
          setAnalyzingIds(prev => new Set([...prev, scored[i].placeId]));
          const analyzed = await analyzeWebsite(scored[i]);
          analyzed.leadScore = calcSearchScore(analyzed);
          setResults(prev => prev.map(r => r.placeId === analyzed.placeId ? analyzed : r));
          setAnalyzingIds(prev => {
            const next = new Set(prev);
            next.delete(scored[i].placeId);
            return next;
          });
        }
      }
    } catch (err) {
      console.error(err);
      addToast('Search failed', 'error');
      setSearching(false);
    }
  }

  function calcSearchScore(r: SearchResult): number {
    let score = 0;
    if (!r.website || r.tags.includes('no_website')) score += 50;
    if (r.tags.includes('bad_website')) score += 30;
    if (r.tags.includes('not_mobile_friendly')) score += 15;
    if (r.tags.includes('slow_loading')) score += 10;
    if (r.tags.includes('outdated_design')) score += 10;
    if (r.tags.includes('low_reviews')) score += 20;
    if (r.emails.length > 0 || r.phone) score += 5;
    if (r.rating && r.rating >= 4.0) score += 10;
    return Math.min(score, 100);
  }

  async function handleAddLead(result: SearchResult) {
    if (!settings) return;
    try {
      // Check for duplicate lead
      const duplicate = await findDuplicateLead(result.name, result.address);
      if (duplicate) {
        addToast('Lead already exists', 'error');
        return;
      }

      const lead: Lead = {
        id: generateId(),
        name: result.name,
        industry,
        location: result.address,
        website: result.website,
        email: result.emails[0],
        phone: result.phone,
        tags: result.tags,
        leadScore: 0,
        notes: `Rating: ${result.rating || 'N/A'} | Reviews: ${result.reviewCount || 0} | Found via Google Places`,
        status: 'new',
        pipelineStage: 'prospect',
        source: 'search',
        dateAdded: new Date().toISOString(),
        customData: { rating: result.rating, reviewCount: result.reviewCount, placeId: result.placeId },
      };
      lead.leadScore = calculateLeadScore(lead);
      await addLead(lead);
      await addActivity(createActivity('lead_added', `Added lead from search: ${lead.name}`, lead.id));
      setAddedIds(prev => new Set([...prev, result.placeId]));
      addToast(`Added ${result.name} to leads`);
    } catch {
      addToast('Failed to add lead', 'error');
    }
  }

  async function handleAddAll() {
    if (!settings) return;
    const toAdd = results.filter(r => !addedIds.has(r.placeId));
    let count = 0;
    for (const result of toAdd) {
      try {
        // Check for duplicate lead
        const duplicate = await findDuplicateLead(result.name, result.address);
        if (duplicate) {
          addToast('Lead already exists', 'error');
          continue;
        }

        const lead: Lead = {
          id: generateId(),
          name: result.name,
          industry,
          location: result.address,
          website: result.website,
          email: result.emails[0],
          phone: result.phone,
          tags: result.tags,
          leadScore: 0,
          notes: `Rating: ${result.rating || 'N/A'} | Reviews: ${result.reviewCount || 0} | Found via Google Places`,
          status: 'new',
          pipelineStage: 'prospect',
          source: 'search',
          dateAdded: new Date().toISOString(),
          customData: { rating: result.rating, reviewCount: result.reviewCount, placeId: result.placeId },
        };
        lead.leadScore = calculateLeadScore(lead);
        await addLead(lead);
        setAddedIds(prev => new Set([...prev, result.placeId]));
        count++;
      } catch { /* skip failed */ }
    }
    if (count > 0) {
      await addActivity(createActivity('lead_added', `Bulk added ${count} leads from search`));
      addToast(`Added ${count} leads`);
    }
  }

  if (loading) return <LoadingSpinner />;

  const hasApiKey = !!(settings?.googleApiKey);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Search Businesses</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">Find businesses that need your services</p>
      </div>

      {!hasApiKey ? (
        <EmptyState
          icon="🔑"
          title="Google API Key Required"
          description="Add your Google Places API key in Settings to search for businesses. You get $200 free credit per month from Google."
          actionLabel="Go to Settings"
          onAction={() => window.location.href = '/settings'}
        />
      ) : (
        <>
          {/* Search Form */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 mb-6">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Industry</label>
                <select value={industry} onChange={e => setIndustry(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm">
                  {INDUSTRIES.map(ind => <option key={ind} value={ind}>{ind}</option>)}
                </select>
              </div>
              <div className="flex-[2]">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Location</label>
                <input type="text" value={location} onChange={e => setLocation(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  placeholder="e.g., Miami, FL" />
              </div>
              <div className="flex items-end">
                <button onClick={handleSearch} disabled={searching}
                  className="w-full sm:w-auto px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap">
                  {searching ? 'Searching...' : 'Search'}
                </button>
              </div>
            </div>
          </div>

          {/* Results */}
          {searching && (
            <div className="flex flex-col items-center py-12">
              <div className="w-8 h-8 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin mb-4" />
              <p className="text-gray-600 dark:text-gray-400">Searching Google Places for {industry.toLowerCase()} in {location}...</p>
            </div>
          )}

          {!searching && results.length > 0 && (
            <>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {results.length} businesses found{fromCache && <span className="ml-1.5 px-1.5 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded text-xs font-medium">(cached)</span>} · {analyzingIds.size > 0 ? `Analyzing ${analyzingIds.size} websites...` : 'Analysis complete'}
                </p>
                <button onClick={handleAddAll} disabled={addedIds.size === results.length}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium disabled:opacity-50">
                  {addedIds.size === results.length ? 'All Added' : `Add All ${results.length - addedIds.size} to Leads`}
                </button>
              </div>

              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Business</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hidden md:table-cell">Contact</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hidden lg:table-cell">Rating</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Issues</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Score</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map(result => (
                        <tr key={result.placeId} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-900 dark:text-white text-sm">{result.name}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[250px]">{result.address}</div>
                            {result.website && (
                              <a href={result.website} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 dark:text-blue-400 hover:underline truncate block max-w-[250px]">
                                {result.website.replace(/https?:\/\/(www\.)?/, '').slice(0, 40)}
                              </a>
                            )}
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            {result.phone && <div className="text-sm text-gray-600 dark:text-gray-400">{result.phone}</div>}
                            {result.emails.length > 0 && <div className="text-xs text-green-600 dark:text-green-400">{result.emails[0]}</div>}
                            {!result.phone && result.emails.length === 0 && <span className="text-xs text-gray-400">—</span>}
                            {analyzingIds.has(result.placeId) && <div className="text-xs text-blue-500 animate-pulse">Scanning...</div>}
                          </td>
                          <td className="px-4 py-3 text-center hidden lg:table-cell">
                            {result.rating ? (
                              <div>
                                <span className="text-sm font-medium text-gray-900 dark:text-white">{result.rating}</span>
                                <span className="text-yellow-500 ml-0.5">★</span>
                                <div className="text-xs text-gray-500 dark:text-gray-400">{result.reviewCount} reviews</div>
                              </div>
                            ) : <span className="text-xs text-gray-400">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {result.tags.length === 0 && <span className="text-xs text-gray-400">None found</span>}
                              {result.tags.map(tag => (
                                <span key={tag} className="px-1.5 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded text-[10px]">
                                  {tag.replace(/_/g, ' ')}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${getScoreColor(result.leadScore)} ${getScoreBgColor(result.leadScore)}`}>
                              {result.leadScore}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {addedIds.has(result.placeId) ? (
                              <span className="px-3 py-1.5 text-xs font-medium text-green-600 dark:text-green-400">Added ✓</span>
                            ) : (
                              <button onClick={() => handleAddLead(result)}
                                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition-colors">
                                Add to Leads
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {!searching && results.length === 0 && (
            <EmptyState icon="🔍" title="Search for Businesses" description={`Enter an industry and location above, then click Search to find businesses that need your services.`} />
          )}
        </>
      )}
    </div>
  );
}
