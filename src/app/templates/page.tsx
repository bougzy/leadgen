'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getAllTemplates, addTemplate, updateTemplate, deleteTemplate } from '@/lib/db';
import { getBuiltInTemplates } from '@/lib/templates';
import type { EmailTemplate } from '@/types';
import { generateId } from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Modal from '@/components/ui/Modal';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORIES = [
  { value: 'no_website', label: 'No Website' },
  { value: 'bad_website', label: 'Bad Website' },
  { value: 'no_social', label: 'No Social Media' },
  { value: 'low_reviews', label: 'Low Reviews' },
  { value: 'general', label: 'General Outreach' },
  { value: 'custom', label: 'Custom' },
];

const VARIABLES: { token: string; label: string }[] = [
  { token: '{business_name}', label: 'Business Name' },
  { token: '{contact_name}', label: 'Contact Name' },
  { token: '{first_name}', label: 'First Name' },
  { token: '{industry}', label: 'Industry' },
  { token: '{location}', label: 'Location' },
  { token: '{website}', label: 'Website' },
  { token: '{your_name}', label: 'Your Name' },
  { token: '{your_email}', label: 'Your Email' },
  { token: '{service_offering}', label: 'Service Offering' },
  { token: '{value_prop}', label: 'Value Prop' },
];

const EXAMPLE_DATA: Record<string, string> = {
  '{business_name}': 'Sunrise Bakery',
  '{contact_name}': 'Sarah Johnson',
  '{first_name}': 'Sarah',
  '{industry}': 'restaurant',
  '{location}': 'Austin, TX',
  '{website}': 'sunrisebakery.com',
  '{your_name}': 'Alex Rivera',
  '{your_email}': 'alex@webpro.io',
  '{service_offering}': 'Website development and digital marketing',
  '{value_prop}': 'I help local businesses get more customers through modern websites and online presence.',
};

function fillPreview(text: string): string {
  let result = text;
  for (const [token, value] of Object.entries(EXAMPLE_DATA)) {
    result = result.replaceAll(token, value);
  }
  return result;
}

function categoryLabel(value: string): string {
  return CATEGORIES.find(c => c.value === value)?.label ?? value;
}

function categoryColor(value: string): string {
  const map: Record<string, string> = {
    no_website: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    bad_website: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    no_social: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
    low_reviews: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
    general: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    custom: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  };
  return map[value] ?? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
}

// ---------------------------------------------------------------------------
// Blank template helper
// ---------------------------------------------------------------------------

function blankDraft(): TemplateDraft {
  return {
    name: '',
    category: 'custom',
    subjectLines: [''],
    body: '',
  };
}

interface TemplateDraft {
  name: string;
  category: string;
  subjectLines: string[];
  body: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TemplatesPage() {
  const router = useRouter();
  const { addToast } = useToast();

  // Data
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Editor state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingBuiltIn, setEditingBuiltIn] = useState(false);
  const [draft, setDraft] = useState<TemplateDraft>(blankDraft());
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // -----------------------------------------------------------------------
  // Data loading
  // -----------------------------------------------------------------------

  const loadData = useCallback(async () => {
    try {
      const builtIn = getBuiltInTemplates();
      const custom = await getAllTemplates();

      // Merge: built-in first, then custom (avoid duplicates by id)
      const builtInIds = new Set(builtIn.map(t => t.id));
      const merged = [
        ...builtIn,
        ...custom.filter(t => !builtInIds.has(t.id)),
      ];
      setTemplates(merged);
    } catch (err) {
      console.error('Failed to load templates:', err);
      addToast('Failed to load templates', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // -----------------------------------------------------------------------
  // Filtering
  // -----------------------------------------------------------------------

  const filtered = templates.filter(t => {
    if (filterCategory !== 'all' && filterCategory !== 'built_in' && filterCategory !== 'custom_only') {
      if (t.category !== filterCategory) return false;
    }
    if (filterCategory === 'built_in' && !t.isBuiltIn) return false;
    if (filterCategory === 'custom_only' && t.isBuiltIn) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (
        !t.name.toLowerCase().includes(q) &&
        !t.category.toLowerCase().includes(q) &&
        !t.body.toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  // -----------------------------------------------------------------------
  // Editor helpers
  // -----------------------------------------------------------------------

  function openCreate() {
    setEditingId(null);
    setEditingBuiltIn(false);
    setDraft(blankDraft());
    setShowPreview(false);
    setEditorOpen(true);
  }

  function openEdit(template: EmailTemplate) {
    setEditingId(template.id);
    setEditingBuiltIn(template.isBuiltIn);
    setDraft({
      name: template.name,
      category: template.category,
      subjectLines: template.subjectLines.length > 0 ? [...template.subjectLines] : [''],
      body: template.body,
    });
    setShowPreview(false);
    setEditorOpen(true);
  }

  function openDuplicate(template: EmailTemplate) {
    setEditingId(null);
    setEditingBuiltIn(false);
    setDraft({
      name: `${template.name} (Copy)`,
      category: template.category === 'custom' ? 'custom' : template.category,
      subjectLines: [...template.subjectLines],
      body: template.body,
    });
    setShowPreview(false);
    setEditorOpen(true);
  }

  // Subject line helpers
  function addSubjectLine() {
    setDraft(prev => ({ ...prev, subjectLines: [...prev.subjectLines, ''] }));
  }

  function removeSubjectLine(idx: number) {
    setDraft(prev => ({
      ...prev,
      subjectLines: prev.subjectLines.length > 1
        ? prev.subjectLines.filter((_, i) => i !== idx)
        : prev.subjectLines,
    }));
  }

  function updateSubjectLine(idx: number, value: string) {
    setDraft(prev => {
      const next = [...prev.subjectLines];
      next[idx] = value;
      return { ...prev, subjectLines: next };
    });
  }

  // Variable insertion
  function insertVariable(token: string) {
    const ta = bodyRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const before = draft.body.slice(0, start);
    const after = draft.body.slice(end);
    const newBody = before + token + after;
    setDraft(prev => ({ ...prev, body: newBody }));
    // Restore cursor position after React re-render
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + token.length;
      ta.setSelectionRange(pos, pos);
    });
  }

  // -----------------------------------------------------------------------
  // Save / Delete
  // -----------------------------------------------------------------------

  async function handleSave() {
    if (!draft.name.trim()) {
      addToast('Template name is required', 'error');
      return;
    }
    if (draft.subjectLines.every(s => !s.trim())) {
      addToast('At least one subject line is required', 'error');
      return;
    }
    if (!draft.body.trim()) {
      addToast('Template body is required', 'error');
      return;
    }

    setSaving(true);
    try {
      const cleanSubjects = draft.subjectLines.filter(s => s.trim() !== '');

      if (editingId && !editingBuiltIn) {
        // Update existing custom template
        const existing = templates.find(t => t.id === editingId);
        const updated: EmailTemplate = {
          id: editingId,
          name: draft.name.trim(),
          category: draft.category,
          subjectLines: cleanSubjects,
          body: draft.body,
          isBuiltIn: false,
          createdAt: existing?.createdAt ?? new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          stats: existing?.stats,
        };
        await updateTemplate(updated);
        addToast('Template updated');
      } else {
        // Create new template (also used when "editing" a built-in which saves a copy)
        const newTemplate: EmailTemplate = {
          id: generateId(),
          name: draft.name.trim(),
          category: draft.category,
          subjectLines: cleanSubjects,
          body: draft.body,
          isBuiltIn: false,
          createdAt: new Date().toISOString(),
        };
        await addTemplate(newTemplate);
        addToast('Template created');
      }

      setEditorOpen(false);
      loadData();
    } catch {
      addToast('Failed to save template', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteTemplate(id);
      addToast('Template deleted');
      setDeleteConfirmId(null);
      if (editorOpen && editingId === id) setEditorOpen(false);
      loadData();
    } catch {
      addToast('Failed to delete template', 'error');
    }
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Templates</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            {templates.length} template{templates.length !== 1 ? 's' : ''} &middot;{' '}
            {templates.filter(t => t.isBuiltIn).length} built-in,{' '}
            {templates.filter(t => !t.isBuiltIn).length} custom
          </p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
        >
          + New Template
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            placeholder="Search templates..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
          />
        </div>
        <select
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value)}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
        >
          <option value="all">All Categories</option>
          <option value="built_in">Built-in Only</option>
          <option value="custom_only">Custom Only</option>
          <optgroup label="Categories">
            {CATEGORIES.map(c => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </optgroup>
        </select>
      </div>

      {/* Template Cards */}
      {filtered.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-12 text-center">
          <div className="text-4xl mb-3">📄</div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
            No Templates Found
          </h3>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">
            {searchQuery || filterCategory !== 'all'
              ? 'Try adjusting your filters.'
              : 'Get started by creating your first email template.'}
          </p>
          <button
            onClick={openCreate}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            + New Template
          </button>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(template => (
            <div
              key={template.id}
              className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 hover:shadow-md transition-shadow flex flex-col"
            >
              {/* Card header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                      {template.name}
                    </h3>
                    {template.isBuiltIn && (
                      <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 uppercase tracking-wide">
                        Built-in
                      </span>
                    )}
                  </div>
                  <span
                    className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${categoryColor(
                      template.category,
                    )}`}
                  >
                    {categoryLabel(template.category)}
                  </span>
                </div>
              </div>

              {/* Subject lines count */}
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                {template.subjectLines.length} subject line
                {template.subjectLines.length !== 1 ? 's' : ''}
              </p>

              {/* Body preview */}
              <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-3 mb-3 flex-1 whitespace-pre-line">
                {template.body.slice(0, 160)}
                {template.body.length > 160 ? '...' : ''}
              </p>

              {/* Stats (if available) */}
              {template.stats && (template.stats.sent > 0 || template.stats.opened > 0 || template.stats.responded > 0) && (
                <div className="flex gap-3 text-xs text-gray-500 dark:text-gray-400 mb-3 border-t border-gray-100 dark:border-gray-800 pt-3">
                  <span>
                    <span className="font-medium text-gray-700 dark:text-gray-300">
                      {template.stats.sent}
                    </span>{' '}
                    sent
                  </span>
                  <span>
                    <span className="font-medium text-gray-700 dark:text-gray-300">
                      {template.stats.opened}
                    </span>{' '}
                    opened
                  </span>
                  <span>
                    <span className="font-medium text-gray-700 dark:text-gray-300">
                      {template.stats.responded}
                    </span>{' '}
                    replied
                  </span>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 border-t border-gray-100 dark:border-gray-800 pt-3 mt-auto">
                {template.isBuiltIn ? (
                  <>
                    <button
                      onClick={() => openEdit(template)}
                      className="flex-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      View
                    </button>
                    <button
                      onClick={() => openDuplicate(template)}
                      className="flex-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                    >
                      Duplicate
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => openEdit(template)}
                      className="flex-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => openDuplicate(template)}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      Duplicate
                    </button>
                    <button
                      onClick={() => setDeleteConfirmId(template.id)}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Editor Modal                                                       */}
      {/* ----------------------------------------------------------------- */}
      <Modal
        isOpen={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={
          editingBuiltIn
            ? `Viewing: ${draft.name}`
            : editingId
            ? 'Edit Template'
            : 'New Template'
        }
        size="xl"
      >
        <div className="space-y-5">
          {/* Built-in notice */}
          {editingBuiltIn && (
            <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
              <span className="text-amber-600 dark:text-amber-400 text-lg leading-none mt-0.5">
                &#9888;
              </span>
              <div className="text-sm text-amber-800 dark:text-amber-300">
                <strong>Built-in template.</strong> This template is read-only. Click{' '}
                <button
                  onClick={() => {
                    setEditorOpen(false);
                    const tpl = templates.find(t => t.id === editingId);
                    if (tpl) openDuplicate(tpl);
                  }}
                  className="underline font-semibold"
                >
                  Duplicate
                </button>{' '}
                to create an editable copy.
              </div>
            </div>
          )}

          {/* Template Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Template Name
            </label>
            <input
              type="text"
              value={draft.name}
              onChange={e => setDraft(prev => ({ ...prev, name: e.target.value }))}
              disabled={editingBuiltIn}
              placeholder="e.g. Restaurant Cold Outreach"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Category
            </label>
            <select
              value={draft.category}
              onChange={e => setDraft(prev => ({ ...prev, category: e.target.value }))}
              disabled={editingBuiltIn}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {CATEGORIES.map(c => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          {/* Subject Lines */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Subject Lines
              </label>
              {!editingBuiltIn && (
                <button
                  onClick={addSubjectLine}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium"
                >
                  + Add Variation
                </button>
              )}
            </div>
            <div className="space-y-2">
              {draft.subjectLines.map((line, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={line}
                    onChange={e => updateSubjectLine(idx, e.target.value)}
                    disabled={editingBuiltIn}
                    placeholder={`Subject line ${idx + 1}`}
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                  {!editingBuiltIn && draft.subjectLines.length > 1 && (
                    <button
                      onClick={() => removeSubjectLine(idx)}
                      className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 dark:text-red-400 transition-colors"
                      title="Remove subject line"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Variable Buttons */}
          {!editingBuiltIn && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Insert Variable
              </label>
              <div className="flex flex-wrap gap-1.5">
                {VARIABLES.map(v => (
                  <button
                    key={v.token}
                    onClick={() => insertVariable(v.token)}
                    className="px-2.5 py-1 text-xs font-medium rounded-md bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-blue-100 dark:hover:bg-blue-900/30 hover:text-blue-700 dark:hover:text-blue-300 border border-gray-200 dark:border-gray-600 transition-colors"
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Body */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Email Body
            </label>
            <textarea
              ref={bodyRef}
              value={draft.body}
              onChange={e => setDraft(prev => ({ ...prev, body: e.target.value }))}
              disabled={editingBuiltIn}
              rows={12}
              placeholder="Write your email body here. Use the variable buttons above to insert dynamic fields..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-mono leading-relaxed resize-y disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>

          {/* Preview Toggle */}
          <div>
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="flex items-center gap-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
            >
              <svg
                className={`w-4 h-4 transition-transform ${showPreview ? 'rotate-90' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              {showPreview ? 'Hide Preview' : 'Show Live Preview'}
            </button>

            {showPreview && (
              <div className="mt-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 font-semibold mb-2">
                  Preview with sample data
                </p>

                {/* Preview subject */}
                <div className="mb-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Subject:</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {fillPreview(draft.subjectLines.find(s => s.trim()) || '(no subject)')}
                  </p>
                </div>

                {/* Preview body */}
                <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Body:</p>
                  <div className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-line leading-relaxed">
                    {fillPreview(draft.body || '(empty)')}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between border-t border-gray-200 dark:border-gray-700 pt-4">
            <div className="flex gap-2">
              {/* Delete (custom only, existing only) */}
              {editingId && !editingBuiltIn && (
                <button
                  onClick={() => setDeleteConfirmId(editingId)}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  Delete
                </button>
              )}
              {/* Use in Campaign */}
              <button
                onClick={() => {
                  setEditorOpen(false);
                  router.push('/campaigns');
                }}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Use in Campaign
              </button>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setEditorOpen(false)}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
              {editingBuiltIn ? (
                <button
                  onClick={() => {
                    setEditorOpen(false);
                    const tpl = templates.find(t => t.id === editingId);
                    if (tpl) openDuplicate(tpl);
                  }}
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                >
                  Duplicate to Edit
                </button>
              ) : (
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {saving && (
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  )}
                  {editingId ? 'Update Template' : 'Save Template'}
                </button>
              )}
            </div>
          </div>
        </div>
      </Modal>

      {/* ----------------------------------------------------------------- */}
      {/* Delete Confirmation Modal                                          */}
      {/* ----------------------------------------------------------------- */}
      <Modal
        isOpen={deleteConfirmId !== null}
        onClose={() => setDeleteConfirmId(null)}
        title="Delete Template"
        size="sm"
      >
        <div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
            Are you sure you want to delete this template? This action cannot be undone.
          </p>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setDeleteConfirmId(null)}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
            >
              Delete Template
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
