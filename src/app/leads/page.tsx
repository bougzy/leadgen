'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getAllAccounts, addAccount, updateAccount, deleteAccount, deleteAccounts, addActivity } from '@/lib/db';
import { getScoreColor, getScoreBgColor } from '@/lib/scoring';
import { createActivity, parseCSV, csvRowToLead, leadsToCSV } from '@/lib/utils';
import type { Account, LifecycleStage } from '@/types';
import { LIFECYCLE_STAGES, INDUSTRIES } from '@/types';
import Modal from '@/components/ui/Modal';
import LeadForm from '@/components/LeadForm';
import EmptyState from '@/components/ui/EmptyState';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Pagination from '@/components/ui/Pagination';
import { useToast } from '@/components/ui/Toast';

type SortKey = 'businessName' | 'industry' | 'leadScore' | 'lifecycleStage' | 'dateAdded';
type SortDir = 'asc' | 'desc';

export default function LeadsPage() {
  const router = useRouter();
  const { addToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [stageFilter, setStageFilter] = useState<string>('all');
  const [industryFilter, setIndustryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('leadScore');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

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

  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  const filteredAccounts = useMemo(() => {
    let result = [...accounts];
    if (stageFilter !== 'all') result = result.filter(a => a.lifecycleStage === stageFilter);
    if (industryFilter !== 'all') result = result.filter(a => a.industry === industryFilter);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(a =>
        a.businessName.toLowerCase().includes(q) ||
        a.industry.toLowerCase().includes(q) ||
        a.location.toLowerCase().includes(q) ||
        a.contactEmail?.toLowerCase().includes(q) ||
        a.contactName?.toLowerCase().includes(q)
      );
    }
    result.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'businessName') cmp = a.businessName.localeCompare(b.businessName);
      else if (sortKey === 'industry') cmp = a.industry.localeCompare(b.industry);
      else if (sortKey === 'leadScore') cmp = a.leadScore - b.leadScore;
      else if (sortKey === 'lifecycleStage') cmp = a.lifecycleStage.localeCompare(b.lifecycleStage);
      else if (sortKey === 'dateAdded') cmp = new Date(a.dateAdded).getTime() - new Date(b.dateAdded).getTime();
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return result;
  }, [accounts, stageFilter, industryFilter, searchQuery, sortKey, sortDir]);

  // Reset to page 1 when filters/sort change
  useEffect(() => { setPage(1); }, [stageFilter, industryFilter, searchQuery, sortKey, sortDir, pageSize]);

  // Paginate
  const totalPages = Math.ceil(filteredAccounts.length / pageSize);
  const paginatedAccounts = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredAccounts.slice(start, start + pageSize);
  }, [filteredAccounts, page, pageSize]);

  async function handleSave(account: Account) {
    try {
      if (editingAccount) {
        await updateAccount(account);
        addToast('Account updated successfully');
      } else {
        await addAccount(account);
        await addActivity(createActivity('lead_added', `Added account: ${account.businessName}`, account.id));
        addToast('Account added successfully');
      }
      setShowAddModal(false);
      setEditingAccount(null);
      loadAccounts();
    } catch (err) {
      console.error('Failed to save account:', err);
      addToast('Failed to save account', 'error');
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this account?')) return;
    try {
      await deleteAccount(id);
      addToast('Account deleted');
      loadAccounts();
    } catch (err) {
      addToast('Failed to delete account', 'error');
    }
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} selected accounts?`)) return;
    try {
      await deleteAccounts(Array.from(selectedIds));
      setSelectedIds(new Set());
      addToast(`Deleted ${selectedIds.size} accounts`);
      loadAccounts();
    } catch {
      addToast('Failed to delete accounts', 'error');
    }
  }

  function handleCSVImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const rows = parseCSV(text);
        const newAccounts = rows.map(csvRowToLead);
        for (const account of newAccounts) { await addAccount(account); }
        await addActivity(createActivity('lead_added', `Imported ${newAccounts.length} accounts from CSV`));
        addToast(`Imported ${newAccounts.length} accounts`);
        loadAccounts();
      } catch {
        addToast('Failed to import CSV', 'error');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleExport() {
    const csv = leadsToCSV(filteredAccounts);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `accounts-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    addToast('Accounts exported to CSV');
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  function toggleSelectAll() {
    if (selectedIds.size === paginatedAccounts.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(paginatedAccounts.map(a => a.id)));
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <span className="text-gray-400 ml-1">↕</span>;
    return <span className="text-blue-600 dark:text-blue-400 ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Leads</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">{accounts.length} total accounts</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => { setEditingAccount(null); setShowAddModal(true); }} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">+ Add Account</button>
          <label className="px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-sm font-medium cursor-pointer">
            Import CSV
            <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleCSVImport} />
          </label>
          {accounts.length > 0 && (
            <button onClick={handleExport} className="px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-sm font-medium">Export CSV</button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 mb-4">
        <div className="flex flex-wrap gap-3">
          <input type="text" placeholder="Search accounts..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            className="flex-1 min-w-0 sm:min-w-[200px] px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
          <select value={stageFilter} onChange={e => setStageFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm">
            <option value="all">All Stages</option>
            {LIFECYCLE_STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <select value={industryFilter} onChange={e => setIndustryFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm">
            <option value="all">All Industries</option>
            {INDUSTRIES.map(ind => <option key={ind} value={ind}>{ind}</option>)}
          </select>
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedIds.size > 0 && (
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 mb-4 flex items-center justify-between">
          <span className="text-sm text-blue-800 dark:text-blue-200">{selectedIds.size} selected</span>
          <div className="flex gap-2">
            <button onClick={handleBulkDelete} className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700">Delete Selected</button>
            <button onClick={() => setSelectedIds(new Set())} className="px-3 py-1.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-medium">Clear</button>
          </div>
        </div>
      )}

      {/* Table */}
      {filteredAccounts.length === 0 ? (
        accounts.length === 0 ? (
          <EmptyState icon="🏢" title="No Accounts Yet" description="Add your first account manually or import from a CSV file." actionLabel="Add Account" onAction={() => setShowAddModal(true)} />
        ) : (
          <EmptyState icon="🔍" title="No Matching Accounts" description="Try adjusting your search or filters." />
        )
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                  <th className="px-4 py-3 text-left"><input type="checkbox" checked={selectedIds.size === paginatedAccounts.length && paginatedAccounts.length > 0} onChange={toggleSelectAll} className="rounded" /></th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase cursor-pointer" onClick={() => handleSort('businessName')}>Name <SortIcon col="businessName" /></th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase cursor-pointer hidden md:table-cell" onClick={() => handleSort('industry')}>Industry <SortIcon col="industry" /></th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hidden lg:table-cell">Location</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase cursor-pointer" onClick={() => handleSort('leadScore')}>Score <SortIcon col="leadScore" /></th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase cursor-pointer" onClick={() => handleSort('lifecycleStage')}>Stage <SortIcon col="lifecycleStage" /></th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedAccounts.map(account => {
                  const stageInfo = LIFECYCLE_STAGES.find(s => s.value === account.lifecycleStage);
                  return (
                    <tr key={account.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                      <td className="px-4 py-3"><input type="checkbox" checked={selectedIds.has(account.id)} onChange={() => toggleSelect(account.id)} className="rounded" /></td>
                      <td className="px-4 py-3">
                        <Link href={`/leads/${account.id}`} className="font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm hover:underline">{account.businessName}</Link>
                        {account.contactName && <div className="text-xs text-gray-500 dark:text-gray-400">{account.contactName}</div>}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 hidden md:table-cell">{account.industry}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 hidden lg:table-cell">{account.location}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${getScoreColor(account.leadScore)} ${getScoreBgColor(account.leadScore)}`}>{account.leadScore}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${stageInfo?.color}`}>{stageInfo?.label}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => router.push(`/emails?leadId=${account.id}`)} className="px-2 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded" title="Generate Email">Email</button>
                          <button onClick={() => { setEditingAccount(account); setShowAddModal(true); }} className="px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded" title="Edit">Edit</button>
                          <button onClick={() => handleDelete(account.id)} className="px-2 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded" title="Delete">Del</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
            total={filteredAccounts.length}
          />
        </div>
      )}

      <Modal isOpen={showAddModal} onClose={() => { setShowAddModal(false); setEditingAccount(null); }} title={editingAccount ? 'Edit Account' : 'Add New Account'} size="lg">
        <LeadForm lead={editingAccount || undefined} onSave={handleSave} onCancel={() => { setShowAddModal(false); setEditingAccount(null); }} />
      </Modal>
    </div>
  );
}
