'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { Account } from '@/types';
import { LIFECYCLE_STAGES } from '@/types';
import { getAccount, getAllAccounts, updateAccount } from '@/lib/db';
import { B2B_INDUSTRY_TEMPLATES } from '@/lib/client-templates';
import { formatDate } from '@/lib/utils';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Modal from '@/components/ui/Modal';
import EmptyState from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';

// ─── Template key type ─────────────────────────────────────────
type IndustryTemplateKey = keyof typeof B2B_INDUSTRY_TEMPLATES;

const TEMPLATE_LABELS: Record<IndustryTemplateKey, string> = {
  property_manager: 'Property Manager',
  real_estate: 'Real Estate Agent',
  airbnb: 'Airbnb / Vacation Rental',
  office: 'Office / Commercial',
};

// ─── Status badge helpers ──────────────────────────────────────
function stageBadge(stage: string): string {
  const found = LIFECYCLE_STAGES.find(s => s.value === stage);
  return found?.color ?? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
}

function stageLabel(stage: string): string {
  const found = LIFECYCLE_STAGES.find(s => s.value === stage);
  return found?.label ?? stage;
}

// ─── Variable substitution ─────────────────────────────────────
function substituteVariables(text: string, vars: Record<string, string>): string {
  let result = text;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{${key}}`, value);
  }
  return result;
}

// ─── Component ─────────────────────────────────────────────────
export default function OutreachPage() {
  const params = useParams();
  const { addToast } = useToast();
  const id = params.id as string;

  // ── State ──
  const [client, setClient] = useState<Account | null>(null);
  const [allAccounts, setAllAccounts_] = useState<Account[]>([]);
  const [linkedAccounts, setLinkedAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Template state
  const [selectedTemplate, setSelectedTemplate] = useState<IndustryTemplateKey>('property_manager');
  const [templateCopied, setTemplateCopied] = useState(false);

  // Link account modal
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkSearch, setLinkSearch] = useState('');
  const [linkingIds, setLinkingIds] = useState<Set<string>>(new Set());

  // ── Load data ──
  const loadData = useCallback(async () => {
    try {
      const [clientData, accounts] = await Promise.all([
        getAccount(id),
        getAllAccounts(),
      ]);

      if (!clientData) {
        setNotFound(true);
        return;
      }

      setClient(clientData);
      setAllAccounts_(accounts);
      setLinkedAccounts(
        accounts.filter(a => a.customData?.accountId === id)
      );
    } catch (err) {
      console.error('Failed to load outreach data:', err);
      addToast('Failed to load outreach data', 'error');
    } finally {
      setLoading(false);
    }
  }, [id, addToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Template variable map ──
  function getTemplateVars(): Record<string, string> {
    if (!client) return {};
    return {
      business_name: client.businessName,
      contact_name: client.contactName ?? '',
      location: client.location,
      service: client.services?.[0] ?? 'cleaning',
      your_name: client.contactName ?? '',
      phone: client.contactPhone ?? '',
      email: client.contactEmail ?? '',
      neighborhood: client.location,
    };
  }

  // ── Copy template ──
  async function handleCopyTemplate() {
    const tpl = B2B_INDUSTRY_TEMPLATES[selectedTemplate];
    const vars = getTemplateVars();
    const subject = substituteVariables(tpl.subject, vars);
    const body = substituteVariables(tpl.body, vars);
    const full = `Subject: ${subject}\n\n${body}`;

    try {
      await navigator.clipboard.writeText(full);
      setTemplateCopied(true);
      addToast('Template copied to clipboard');
      setTimeout(() => setTemplateCopied(false), 2000);
    } catch {
      addToast('Failed to copy template', 'error');
    }
  }

  // ── Link account ──
  async function handleLinkAccount(account: Account) {
    setLinkingIds(prev => new Set(prev).add(account.id));
    try {
      const updated: Account = {
        ...account,
        customData: { ...(account.customData || {}), accountId: id },
      };
      await updateAccount(updated);

      setLinkedAccounts(prev => [...prev, updated]);
      setAllAccounts_(prev => prev.map(a => (a.id === account.id ? updated : a)));
      addToast(`Linked "${account.businessName}" to this client`);
    } catch (err) {
      console.error('Failed to link account:', err);
      addToast('Failed to link account', 'error');
    } finally {
      setLinkingIds(prev => {
        const next = new Set(prev);
        next.delete(account.id);
        return next;
      });
    }
  }

  // ── Unlink account ──
  async function handleUnlinkAccount(account: Account) {
    try {
      const customData = { ...(account.customData || {}) };
      delete customData.accountId;
      const updated: Account = { ...account, customData };
      await updateAccount(updated);

      setLinkedAccounts(prev => prev.filter(a => a.id !== account.id));
      setAllAccounts_(prev => prev.map(a => (a.id === account.id ? updated : a)));
      addToast(`Unlinked "${account.businessName}"`);
    } catch (err) {
      console.error('Failed to unlink account:', err);
      addToast('Failed to unlink account', 'error');
    }
  }

  // ── Stats ──
  const totalLinked = linkedAccounts.length;
  const contactedCount = linkedAccounts.filter(a => a.lifecycleStage !== 'prospect').length;
  const engagedCount = linkedAccounts.filter(a => a.lifecycleStage === 'engaged' || a.lifecycleStage === 'qualified' || a.lifecycleStage === 'won').length;

  // ── Accounts available to link (not already linked to this client) ──
  const availableAccounts = allAccounts.filter(a => a.customData?.accountId !== id);
  const filteredAvailable = linkSearch.trim()
    ? availableAccounts.filter(a =>
        a.businessName.toLowerCase().includes(linkSearch.toLowerCase()) ||
        (a.contactEmail ?? '').toLowerCase().includes(linkSearch.toLowerCase()) ||
        (a.contactName ?? '').toLowerCase().includes(linkSearch.toLowerCase())
      )
    : availableAccounts;

  // ── Loading / not found ──
  if (loading) return <LoadingSpinner />;

  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <span className="text-5xl mb-4">🔍</span>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Client Not Found</h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6">This client does not exist or has been deleted.</p>
        <Link href="/clients" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">
          Back to Clients
        </Link>
      </div>
    );
  }

  if (!client) return null;

  const tpl = B2B_INDUSTRY_TEMPLATES[selectedTemplate];
  const vars = getTemplateVars();

  return (
    <div>
      {/* Back Link */}
      <Link
        href={`/clients/${id}`}
        className="inline-flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 mb-4 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to {client.businessName}
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
            B2B Outreach
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {client.businessName} — Manage outreach templates and linked accounts
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/search"
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            Search for Accounts
          </Link>
          <button
            onClick={() => setShowLinkModal(true)}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Link Existing Account
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Linked Accounts</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{totalLinked}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Contacted</p>
          <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{contactedCount}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Engaged</p>
          <p className="text-2xl font-bold text-green-600 dark:text-green-400">{engagedCount}</p>
        </div>
      </div>

      {/* Email Template Section */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Industry Email Templates
        </h2>

        {/* Template Selector */}
        <div className="flex flex-wrap gap-2 mb-4">
          {(Object.keys(B2B_INDUSTRY_TEMPLATES) as IndustryTemplateKey[]).map(key => (
            <button
              key={key}
              onClick={() => setSelectedTemplate(key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                selectedTemplate === key
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                  : 'text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {TEMPLATE_LABELS[key]}
            </button>
          ))}
        </div>

        {/* Template Preview */}
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 mb-4 border border-gray-200 dark:border-gray-700">
          <div className="mb-3">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Subject</span>
            <p className="text-sm font-medium text-gray-900 dark:text-white mt-1">
              {substituteVariables(tpl.subject, vars)}
            </p>
          </div>
          <div>
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Body</span>
            <pre className="text-sm text-gray-700 dark:text-gray-300 mt-1 whitespace-pre-wrap font-sans leading-relaxed">
              {substituteVariables(tpl.body, vars)}
            </pre>
          </div>
        </div>

        {/* Copy Button */}
        <button
          onClick={handleCopyTemplate}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            templateCopied
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {templateCopied ? 'Copied!' : 'Copy Template'}
        </button>
      </div>

      {/* Linked Accounts List */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Linked Accounts ({totalLinked})
          </h2>
        </div>

        {linkedAccounts.length === 0 ? (
          <EmptyState
            icon="📧"
            title="No Linked Accounts"
            description="Link accounts from your database to this client to track outreach progress."
            actionLabel="Link Existing Account"
            onAction={() => setShowLinkModal(true)}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                  <th className="pb-3 pr-4 font-medium">Name</th>
                  <th className="pb-3 pr-4 font-medium">Email</th>
                  <th className="pb-3 pr-4 font-medium">Stage</th>
                  <th className="pb-3 pr-4 font-medium">Last Contacted</th>
                  <th className="pb-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {linkedAccounts.map(account => (
                  <tr
                    key={account.id}
                    className="border-b border-gray-100 dark:border-gray-800 last:border-0"
                  >
                    <td className="py-3 pr-4">
                      <Link
                        href={`/leads/${account.id}`}
                        className="font-medium text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                      >
                        {account.businessName}
                      </Link>
                      {account.contactName && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {account.contactName}
                        </p>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-gray-600 dark:text-gray-400">
                      {account.contactEmail || <span className="text-gray-400 dark:text-gray-500 italic">No email</span>}
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${stageBadge(account.lifecycleStage)}`}>
                        {stageLabel(account.lifecycleStage)}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-gray-600 dark:text-gray-400">
                      {account.lastContacted ? formatDate(account.lastContacted) : <span className="text-gray-400 dark:text-gray-500 italic">Never</span>}
                    </td>
                    <td className="py-3 text-right">
                      <button
                        onClick={() => handleUnlinkAccount(account)}
                        className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 font-medium transition-colors"
                      >
                        Unlink
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Link Account Modal */}
      <Modal
        isOpen={showLinkModal}
        onClose={() => {
          setShowLinkModal(false);
          setLinkSearch('');
        }}
        title="Link Existing Account"
        size="lg"
      >
        <div>
          {/* Search */}
          <div className="mb-4">
            <input
              type="text"
              placeholder="Search by name, email, or contact..."
              value={linkSearch}
              onChange={e => setLinkSearch(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {filteredAvailable.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                {availableAccounts.length === 0
                  ? 'All accounts are already linked to this client.'
                  : 'No accounts match your search.'}
              </p>
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto space-y-1">
              {filteredAvailable.slice(0, 50).map(account => {
                const isLinking = linkingIds.has(account.id);
                return (
                  <div
                    key={account.id}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {account.businessName}
                      </p>
                      <div className="flex items-center gap-3 mt-0.5">
                        {account.contactName && (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {account.contactName}
                          </span>
                        )}
                        {account.contactEmail && (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {account.contactEmail}
                          </span>
                        )}
                        <span className={`inline-flex px-1.5 py-0.5 rounded-full text-xs font-medium ${stageBadge(account.lifecycleStage)}`}>
                          {stageLabel(account.lifecycleStage)}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleLinkAccount(account)}
                      disabled={isLinking}
                      className="ml-3 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      {isLinking ? 'Linking...' : 'Link'}
                    </button>
                  </div>
                );
              })}
              {filteredAvailable.length > 50 && (
                <p className="text-xs text-gray-500 dark:text-gray-400 text-center pt-2">
                  Showing 50 of {filteredAvailable.length} accounts. Narrow your search to see more.
                </p>
              )}
            </div>
          )}

          <div className="flex justify-end mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={() => {
                setShowLinkModal(false);
                setLinkSearch('');
              }}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
