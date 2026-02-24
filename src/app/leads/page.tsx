'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getAllLeads, addLead, updateLead, deleteLead, deleteLeads, addActivity } from '@/lib/db';
import { getScoreColor, getScoreBgColor } from '@/lib/scoring';
import { createActivity, parseCSV, csvRowToLead, leadsToCSV } from '@/lib/utils';
import type { Lead } from '@/types';
import { LEAD_STATUSES, INDUSTRIES } from '@/types';
import Modal from '@/components/ui/Modal';
import LeadForm from '@/components/LeadForm';
import EmptyState from '@/components/ui/EmptyState';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Pagination from '@/components/ui/Pagination';
import { useToast } from '@/components/ui/Toast';

type SortKey = 'name' | 'industry' | 'leadScore' | 'status' | 'dateAdded';
type SortDir = 'asc' | 'desc';

export default function LeadsPage() {
  const router = useRouter();
  const { addToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [industryFilter, setIndustryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('leadScore');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const loadLeads = useCallback(async () => {
    try {
      const data = await getAllLeads();
      setLeads(data);
    } catch (err) {
      console.error('Failed to load leads:', err);
      addToast('Failed to load leads', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { loadLeads(); }, [loadLeads]);

  const filteredLeads = useMemo(() => {
    let result = [...leads];
    if (statusFilter !== 'all') result = result.filter(l => l.status === statusFilter);
    if (industryFilter !== 'all') result = result.filter(l => l.industry === industryFilter);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(l =>
        l.name.toLowerCase().includes(q) ||
        l.industry.toLowerCase().includes(q) ||
        l.location.toLowerCase().includes(q) ||
        l.email?.toLowerCase().includes(q) ||
        l.contactName?.toLowerCase().includes(q)
      );
    }
    result.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortKey === 'industry') cmp = a.industry.localeCompare(b.industry);
      else if (sortKey === 'leadScore') cmp = a.leadScore - b.leadScore;
      else if (sortKey === 'status') cmp = a.status.localeCompare(b.status);
      else if (sortKey === 'dateAdded') cmp = new Date(a.dateAdded).getTime() - new Date(b.dateAdded).getTime();
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return result;
  }, [leads, statusFilter, industryFilter, searchQuery, sortKey, sortDir]);

  // Reset to page 1 when filters/sort change
  useEffect(() => { setPage(1); }, [statusFilter, industryFilter, searchQuery, sortKey, sortDir, pageSize]);

  // Paginate
  const totalPages = Math.ceil(filteredLeads.length / pageSize);
  const paginatedLeads = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredLeads.slice(start, start + pageSize);
  }, [filteredLeads, page, pageSize]);

  async function handleSave(lead: Lead) {
    try {
      if (editingLead) {
        await updateLead(lead);
        addToast('Lead updated successfully');
      } else {
        await addLead(lead);
        await addActivity(createActivity('lead_added', `Added lead: ${lead.name}`, lead.id));
        addToast('Lead added successfully');
      }
      setShowAddModal(false);
      setEditingLead(null);
      loadLeads();
    } catch (err) {
      console.error('Failed to save lead:', err);
      addToast('Failed to save lead', 'error');
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this lead?')) return;
    try {
      await deleteLead(id);
      addToast('Lead deleted');
      loadLeads();
    } catch (err) {
      addToast('Failed to delete lead', 'error');
    }
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} selected leads?`)) return;
    try {
      await deleteLeads(Array.from(selectedIds));
      setSelectedIds(new Set());
      addToast(`Deleted ${selectedIds.size} leads`);
      loadLeads();
    } catch {
      addToast('Failed to delete leads', 'error');
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
        const newLeads = rows.map(csvRowToLead);
        for (const lead of newLeads) { await addLead(lead); }
        await addActivity(createActivity('lead_added', `Imported ${newLeads.length} leads from CSV`));
        addToast(`Imported ${newLeads.length} leads`);
        loadLeads();
      } catch {
        addToast('Failed to import CSV', 'error');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleExport() {
    const csv = leadsToCSV(filteredLeads);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    addToast('Leads exported to CSV');
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  function toggleSelectAll() {
    if (selectedIds.size === paginatedLeads.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(paginatedLeads.map(l => l.id)));
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
          <p className="text-gray-600 dark:text-gray-400 mt-1">{leads.length} total leads</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => { setEditingLead(null); setShowAddModal(true); }} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">+ Add Lead</button>
          <label className="px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-sm font-medium cursor-pointer">
            Import CSV
            <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleCSVImport} />
          </label>
          {leads.length > 0 && (
            <button onClick={handleExport} className="px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-sm font-medium">Export CSV</button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 mb-4">
        <div className="flex flex-wrap gap-3">
          <input type="text" placeholder="Search leads..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            className="flex-1 min-w-0 sm:min-w-[200px] px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm">
            <option value="all">All Statuses</option>
            {LEAD_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
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
      {filteredLeads.length === 0 ? (
        leads.length === 0 ? (
          <EmptyState icon="🏢" title="No Leads Yet" description="Add your first lead manually or import from a CSV file." actionLabel="Add Lead" onAction={() => setShowAddModal(true)} />
        ) : (
          <EmptyState icon="🔍" title="No Matching Leads" description="Try adjusting your search or filters." />
        )
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                  <th className="px-4 py-3 text-left"><input type="checkbox" checked={selectedIds.size === paginatedLeads.length && paginatedLeads.length > 0} onChange={toggleSelectAll} className="rounded" /></th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase cursor-pointer" onClick={() => handleSort('name')}>Name <SortIcon col="name" /></th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase cursor-pointer hidden md:table-cell" onClick={() => handleSort('industry')}>Industry <SortIcon col="industry" /></th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hidden lg:table-cell">Location</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase cursor-pointer" onClick={() => handleSort('leadScore')}>Score <SortIcon col="leadScore" /></th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase cursor-pointer" onClick={() => handleSort('status')}>Status <SortIcon col="status" /></th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedLeads.map(lead => {
                  const statusInfo = LEAD_STATUSES.find(s => s.value === lead.status);
                  return (
                    <tr key={lead.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                      <td className="px-4 py-3"><input type="checkbox" checked={selectedIds.has(lead.id)} onChange={() => toggleSelect(lead.id)} className="rounded" /></td>
                      <td className="px-4 py-3">
                        <Link href={`/leads/${lead.id}`} className="font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm hover:underline">{lead.name}</Link>
                        {lead.contactName && <div className="text-xs text-gray-500 dark:text-gray-400">{lead.contactName}</div>}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 hidden md:table-cell">{lead.industry}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 hidden lg:table-cell">{lead.location}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${getScoreColor(lead.leadScore)} ${getScoreBgColor(lead.leadScore)}`}>{lead.leadScore}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusInfo?.color}`}>{statusInfo?.label}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => router.push(`/emails?leadId=${lead.id}`)} className="px-2 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded" title="Generate Email">Email</button>
                          <button onClick={() => { setEditingLead(lead); setShowAddModal(true); }} className="px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded" title="Edit">Edit</button>
                          <button onClick={() => handleDelete(lead.id)} className="px-2 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded" title="Delete">Del</button>
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
            total={filteredLeads.length}
          />
        </div>
      )}

      <Modal isOpen={showAddModal} onClose={() => { setShowAddModal(false); setEditingLead(null); }} title={editingLead ? 'Edit Lead' : 'Add New Lead'} size="lg">
        <LeadForm lead={editingLead || undefined} onSave={handleSave} onCancel={() => { setShowAddModal(false); setEditingLead(null); }} />
      </Modal>
    </div>
  );
}
