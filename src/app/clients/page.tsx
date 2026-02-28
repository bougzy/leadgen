'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getAllAccounts, addAccount, updateAccount, deleteAccount } from '@/lib/db';
import { generateId } from '@/lib/utils';
import type { Account, LifecycleStage } from '@/types';
import { LIFECYCLE_STAGES, INDUSTRIES } from '@/types';

const CLIENT_LIFECYCLE_STAGES = LIFECYCLE_STAGES.filter(s =>
  ['won', 'active_client', 'paused', 'churned'].includes(s.value)
);
import Modal from '@/components/ui/Modal';
import EmptyState from '@/components/ui/EmptyState';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useToast } from '@/components/ui/Toast';

const emptyForm = {
  businessName: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  industry: INDUSTRIES[0],
  location: '',
  address: '',
  website: '',
  gbpUrl: '',
  services: '',
  serviceArea: '',
  monthlyFee: '',
  notes: '',
  lifecycleStage: 'active_client' as LifecycleStage,
};

export default function ClientsPage() {
  const router = useRouter();
  const { addToast } = useToast();

  const [clients, setClients] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Account | null>(null);
  const [form, setForm] = useState(emptyForm);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const loadClients = useCallback(async () => {
    try {
      const data = await getAllAccounts();
      // Filter to only show client-stage accounts
      setClients(data.filter(a => ['won', 'active_client', 'paused', 'churned'].includes(a.lifecycleStage)));
    } catch (err) {
      console.error('Failed to load clients:', err);
      addToast('Failed to load clients', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { loadClients(); }, [loadClients]);

  const filteredClients = useMemo(() => {
    let result = [...clients];
    if (statusFilter !== 'all') {
      result = result.filter(c => c.lifecycleStage === statusFilter);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(c =>
        c.businessName.toLowerCase().includes(q) ||
        c.industry.toLowerCase().includes(q) ||
        c.location.toLowerCase().includes(q)
      );
    }
    return result;
  }, [clients, statusFilter, searchQuery]);

  function openAddModal() {
    setEditingClient(null);
    setForm(emptyForm);
    setShowModal(true);
  }

  function openEditModal(client: Account) {
    setEditingClient(client);
    setForm({
      businessName: client.businessName,
      contactName: client.contactName || '',
      contactEmail: client.contactEmail || '',
      contactPhone: client.contactPhone || '',
      industry: client.industry,
      location: client.location,
      address: client.address || '',
      website: client.website || '',
      gbpUrl: client.gbpUrl || '',
      services: client.services.join(', '),
      serviceArea: client.serviceArea.join(', '),
      monthlyFee: client.monthlyFee ? String(client.monthlyFee) : '',
      notes: client.notes,
      lifecycleStage: client.lifecycleStage,
    });
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.businessName.trim()) {
      addToast('Business name is required', 'error');
      return;
    }
    if (!form.contactName.trim()) {
      addToast('Contact name is required', 'error');
      return;
    }

    const now = new Date().toISOString();
    const account: Account = {
      id: editingClient ? editingClient.id : generateId(),
      businessName: form.businessName.trim(),
      contactName: form.contactName.trim(),
      contactEmail: form.contactEmail.trim() || undefined,
      contactPhone: form.contactPhone.trim() || undefined,
      industry: form.industry,
      location: form.location.trim(),
      address: form.address.trim(),
      website: form.website.trim() || undefined,
      gbpUrl: form.gbpUrl.trim() || undefined,
      serviceArea: form.serviceArea.split(',').map(s => s.trim()).filter(Boolean),
      services: form.services.split(',').map(s => s.trim()).filter(Boolean),
      lifecycleStage: form.lifecycleStage,
      pipelineStage: editingClient ? editingClient.pipelineStage : 'won',
      tags: editingClient ? editingClient.tags : [],
      leadScore: editingClient ? editingClient.leadScore : 50,
      notes: form.notes.trim(),
      monthlyFee: form.monthlyFee ? parseFloat(form.monthlyFee) : undefined,
      dateAdded: editingClient ? editingClient.dateAdded : now,
      updatedAt: now,
    };

    try {
      if (editingClient) {
        await updateAccount(account);
        addToast('Client updated successfully');
      } else {
        await addAccount(account);
        addToast('Client added successfully');
      }
      setShowModal(false);
      setEditingClient(null);
      setForm(emptyForm);
      loadClients();
    } catch (err) {
      console.error('Failed to save client:', err);
      addToast('Failed to save client', 'error');
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) return;
    try {
      await deleteAccount(id);
      addToast('Client deleted');
      loadClients();
    } catch (err) {
      console.error('Failed to delete client:', err);
      addToast('Failed to delete client', 'error');
    }
  }

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Client Sites</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">{clients.length} managed client{clients.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={openAddModal}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
        >
          + Add Client
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 mb-4">
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="Search by name, industry, location..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="flex-1 min-w-0 sm:min-w-[200px] px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
          >
            <option value="all">All Statuses</option>
            {CLIENT_LIFECYCLE_STAGES.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Client Cards Grid */}
      {filteredClients.length === 0 ? (
        clients.length === 0 ? (
          <EmptyState
            icon="🏢"
            title="No Client Sites Yet"
            description="Add your first managed client site to start tracking their GBP, SEO, social media, and more."
            actionLabel="Add Client"
            onAction={openAddModal}
          />
        ) : (
          <EmptyState
            icon="🔍"
            title="No Matching Clients"
            description="Try adjusting your search or status filter."
          />
        )
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredClients.map(client => {
            const statusInfo = LIFECYCLE_STAGES.find(s => s.value === client.lifecycleStage);
            return (
              <div
                key={client.id}
                className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
              >
                {/* Card Header */}
                <div className="flex items-start justify-between mb-3">
                  <Link
                    href={`/clients/${client.id}`}
                    className="font-semibold text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors text-lg leading-tight"
                  >
                    {client.businessName}
                  </Link>
                  {statusInfo && (
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ml-2 ${statusInfo.color}`}>
                      {statusInfo.label}
                    </span>
                  )}
                </div>

                {/* Industry & Location */}
                <div className="space-y-1 mb-3">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    <span className="inline-block w-4 text-center mr-1">🏷</span>
                    {client.industry}
                  </p>
                  {client.location && (
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      <span className="inline-block w-4 text-center mr-1">📍</span>
                      {client.location}
                    </p>
                  )}
                </div>

                {/* Services */}
                {client.services.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {client.services.slice(0, 3).map(service => (
                      <span
                        key={service}
                        className="inline-flex px-2 py-0.5 rounded-full text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                      >
                        {service}
                      </span>
                    ))}
                    {client.services.length > 3 && (
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-500">
                        +{client.services.length - 3} more
                      </span>
                    )}
                  </div>
                )}

                {/* Monthly Fee */}
                {client.monthlyFee != null && (
                  <p className="text-sm font-medium text-green-600 dark:text-green-400 mb-3">
                    ${client.monthlyFee.toLocaleString()}/mo
                  </p>
                )}

                {/* GBP Link */}
                {client.gbpUrl && (
                  <a
                    href={client.gbpUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline mb-3 block truncate"
                  >
                    View Google Business Profile
                  </a>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 pt-3 border-t border-gray-100 dark:border-gray-800 mt-auto">
                  <Link
                    href={`/clients/${client.id}`}
                    className="flex-1 px-3 py-1.5 text-center text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                  >
                    Dashboard
                  </Link>
                  <button
                    onClick={(e) => { e.stopPropagation(); openEditModal(client); }}
                    className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(client.id, client.businessName); }}
                    className="px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setEditingClient(null); setForm(emptyForm); }}
        title={editingClient ? 'Edit Client' : 'Add New Client'}
        size="lg"
      >
        <div className="space-y-4">
          {/* Business Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Business Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.businessName}
              onChange={e => setForm(prev => ({ ...prev, businessName: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g. Joe's Pizza"
            />
          </div>

          {/* Contact Name & Email */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Contact Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.contactName}
                onChange={e => setForm(prev => ({ ...prev, contactName: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g. Joe Romano"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
              <input
                type="email"
                value={form.contactEmail}
                onChange={e => setForm(prev => ({ ...prev, contactEmail: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="joe@joespizza.com"
              />
            </div>
          </div>

          {/* Phone & Industry */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone</label>
              <input
                type="tel"
                value={form.contactPhone}
                onChange={e => setForm(prev => ({ ...prev, contactPhone: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="305-555-0123"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Industry</label>
              <select
                value={form.industry}
                onChange={e => setForm(prev => ({ ...prev, industry: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
              >
                {INDUSTRIES.map(ind => (
                  <option key={ind} value={ind}>{ind}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Location & Address */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Location</label>
              <input
                type="text"
                value={form.location}
                onChange={e => setForm(prev => ({ ...prev, location: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Miami, FL"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Address</label>
              <input
                type="text"
                value={form.address}
                onChange={e => setForm(prev => ({ ...prev, address: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="123 Main St, Miami, FL 33101"
              />
            </div>
          </div>

          {/* Website & GBP URL */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Website</label>
              <input
                type="url"
                value={form.website}
                onChange={e => setForm(prev => ({ ...prev, website: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="https://joespizza.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">GBP URL</label>
              <input
                type="url"
                value={form.gbpUrl}
                onChange={e => setForm(prev => ({ ...prev, gbpUrl: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="https://maps.google.com/..."
              />
            </div>
          </div>

          {/* Services & Service Area */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Services (comma-separated)</label>
            <input
              type="text"
              value={form.services}
              onChange={e => setForm(prev => ({ ...prev, services: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Web Design, SEO, Social Media"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Service Area (comma-separated)</label>
            <input
              type="text"
              value={form.serviceArea}
              onChange={e => setForm(prev => ({ ...prev, serviceArea: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Miami, Coral Gables, Doral"
            />
          </div>

          {/* Monthly Fee & Lifecycle Stage */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Monthly Fee ($)</label>
              <input
                type="number"
                value={form.monthlyFee}
                onChange={e => setForm(prev => ({ ...prev, monthlyFee: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="500"
                min="0"
                step="1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Lifecycle Stage</label>
              <select
                value={form.lifecycleStage}
                onChange={e => setForm(prev => ({ ...prev, lifecycleStage: e.target.value as LifecycleStage }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
              >
                {CLIENT_LIFECYCLE_STAGES.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              placeholder="Any additional notes..."
            />
          </div>

          {/* Form Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => { setShowModal(false); setEditingClient(null); setForm(emptyForm); }}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              {editingClient ? 'Update Client' : 'Add Client'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
