'use client';

import { useState } from 'react';
import type { Account, LifecycleStage } from '@/types';
import { INDUSTRIES, TAGS, PIPELINE_STAGES, LIFECYCLE_STAGES } from '@/types';
import type { PipelineStage } from '@/types';
import { generateId } from '@/lib/utils';
import { calculateLeadScore } from '@/lib/scoring';

interface LeadFormProps {
  lead?: Account;
  onSave: (account: Account) => void;
  onCancel: () => void;
}

export default function LeadForm({ lead, onSave, onCancel }: LeadFormProps) {
  const [form, setForm] = useState({
    businessName: lead?.businessName || '',
    contactName: lead?.contactName || '',
    industry: lead?.industry || 'Restaurant',
    location: lead?.location || '',
    website: lead?.website || '',
    contactEmail: lead?.contactEmail || '',
    contactPhone: lead?.contactPhone || '',
    tags: lead?.tags || [] as string[],
    notes: lead?.notes || '',
    lifecycleStage: lead?.lifecycleStage || 'prospect' as LifecycleStage,
    pipelineStage: lead?.pipelineStage || 'prospect' as PipelineStage,
    dealValue: lead?.dealValue ?? ('' as number | ''),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const account: Account = {
      id: lead?.id || generateId(),
      businessName: form.businessName,
      contactName: form.contactName || undefined,
      industry: form.industry,
      location: form.location,
      website: form.website || undefined,
      contactEmail: form.contactEmail || undefined,
      contactPhone: form.contactPhone || undefined,
      tags: form.tags,
      leadScore: 0,
      notes: form.notes,
      lifecycleStage: form.lifecycleStage,
      pipelineStage: form.pipelineStage,
      services: lead?.services || [],
      serviceArea: lead?.serviceArea || [],
      dealValue: form.dealValue !== '' ? Number(form.dealValue) : undefined,
      dateAdded: lead?.dateAdded || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastContacted: lead?.lastContacted,
      source: lead?.source,
      unsubscribed: lead?.unsubscribed,
    };
    account.leadScore = calculateLeadScore(account);
    onSave(account);
  }

  function toggleTag(tag: string) {
    setForm(prev => ({
      ...prev,
      tags: prev.tags.includes(tag)
        ? prev.tags.filter(t => t !== tag)
        : [...prev.tags, tag],
    }));
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Business Name *</label>
          <input
            type="text"
            required
            value={form.businessName}
            onChange={e => setForm(prev => ({ ...prev, businessName: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="e.g., Joe's Pizza"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Contact Name</label>
          <input
            type="text"
            value={form.contactName}
            onChange={e => setForm(prev => ({ ...prev, contactName: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="e.g., Joe Romano"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Industry *</label>
          <select
            required
            value={form.industry}
            onChange={e => setForm(prev => ({ ...prev, industry: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            {INDUSTRIES.map(ind => (
              <option key={ind} value={ind}>{ind}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Location *</label>
          <input
            type="text"
            required
            value={form.location}
            onChange={e => setForm(prev => ({ ...prev, location: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="e.g., Miami, FL"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Website</label>
          <input
            type="url"
            value={form.website}
            onChange={e => setForm(prev => ({ ...prev, website: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="https://..."
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
          <input
            type="email"
            value={form.contactEmail}
            onChange={e => setForm(prev => ({ ...prev, contactEmail: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="email@example.com"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone</label>
          <input
            type="tel"
            value={form.contactPhone}
            onChange={e => setForm(prev => ({ ...prev, contactPhone: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="305-555-0123"
          />
        </div>
      </div>

      {lead && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Lifecycle Stage</label>
          <select
            value={form.lifecycleStage}
            onChange={e => setForm(prev => ({ ...prev, lifecycleStage: e.target.value as LifecycleStage }))}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            {LIFECYCLE_STAGES.map(stage => (
              <option key={stage.value} value={stage.value}>{stage.label}</option>
            ))}
          </select>
        </div>
      )}

      {lead && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Pipeline Stage</label>
          <select
            value={form.pipelineStage}
            onChange={e => setForm(prev => ({ ...prev, pipelineStage: e.target.value as PipelineStage }))}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            {PIPELINE_STAGES.map(stage => (
              <option key={stage.value} value={stage.value}>{stage.label}</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Deal Value ($)</label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={form.dealValue}
          onChange={e => setForm(prev => ({ ...prev, dealValue: e.target.value === '' ? '' : Number(e.target.value) }))}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="e.g., 5000"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Tags</label>
        <div className="flex flex-wrap gap-2">
          {TAGS.map(tag => (
            <button
              key={tag}
              type="button"
              onClick={() => toggleTag(tag)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                form.tags.includes(tag)
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {tag.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
        <textarea
          value={form.notes}
          onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="Any additional notes..."
        />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
        >
          {lead ? 'Update Account' : 'Add Account'}
        </button>
      </div>
    </form>
  );
}
