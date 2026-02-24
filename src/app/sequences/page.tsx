'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { getAllSequences, addSequence, updateSequence, deleteSequence } from '@/lib/db';
import type { FollowUpSequence, FollowUpStep } from '@/types';
import { generateId } from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';
import Modal from '@/components/ui/Modal';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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

const CONDITIONS: { value: FollowUpStep['condition']; label: string }[] = [
  { value: 'no_reply', label: 'If no reply' },
  { value: 'no_open', label: 'If email not opened' },
  { value: 'always', label: 'Always' },
];

// ---------------------------------------------------------------------------
// Default Sequences
// ---------------------------------------------------------------------------

function createDefaultSequences(): FollowUpSequence[] {
  return [
    {
      id: 'default-standard-3-step',
      name: 'Standard 3-Step Follow-up',
      isActive: false,
      createdAt: new Date().toISOString(),
      steps: [
        {
          id: generateId(),
          delayDays: 5,
          condition: 'no_reply',
          subject: 'Following up - {business_name}',
          body: 'Hi {contact_name},\n\nJust wanted to follow up on my previous email about {business_name}.\n\nI believe there\'s a real opportunity to help you attract more customers online.\n\nWould 10 minutes this week work for a quick chat?\n\nBest,\n{your_name}',
        },
        {
          id: generateId(),
          delayDays: 7,
          condition: 'no_reply',
          subject: 'One more thought for {business_name}',
          body: 'Hi {contact_name},\n\nI know you\'re busy running {business_name}, so I\'ll keep this brief.\n\nI\'ve helped similar {industry} businesses increase their online visibility and customer inquiries. I\'d love to share a couple of specific ideas I have for your business.\n\nNo pressure at all - just let me know if you\'d like to chat.\n\n{your_name}',
        },
        {
          id: generateId(),
          delayDays: 14,
          condition: 'no_reply',
          subject: 'Last note from {your_name}',
          body: 'Hi {contact_name},\n\nThis will be my last email. I don\'t want to be a bother.\n\nIf you ever want to explore ways to get more customers through your online presence, feel free to reply to this email anytime.\n\nWishing {business_name} all the best!\n\n{your_name}',
        },
      ],
    },
    {
      id: 'default-quick-2-step',
      name: 'Quick 2-Step Nudge',
      isActive: false,
      createdAt: new Date().toISOString(),
      steps: [
        {
          id: generateId(),
          delayDays: 3,
          condition: 'no_reply',
          subject: 'Quick follow-up',
          body: 'Hi {contact_name},\n\nJust bumping this to the top of your inbox. Did you get a chance to look at my previous email?\n\nHappy to chat whenever works for you.\n\n{your_name}',
        },
        {
          id: generateId(),
          delayDays: 7,
          condition: 'no_reply',
          subject: 'Closing the loop',
          body: 'Hi {contact_name},\n\nI\'ll assume the timing isn\'t right. No worries at all!\n\nIf things change, you know where to find me.\n\nBest,\n{your_name}',
        },
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// Helper: blank step
// ---------------------------------------------------------------------------

function createBlankStep(): FollowUpStep {
  return {
    id: generateId(),
    delayDays: 3,
    condition: 'no_reply',
    subject: '',
    body: '',
  };
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function SequencesPage() {
  const { addToast } = useToast();

  const [sequences, setSequences] = useState<FollowUpSequence[]>([]);
  const [loading, setLoading] = useState(true);

  // Editor state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingSequence, setEditingSequence] = useState<FollowUpSequence | null>(null);
  const [editorName, setEditorName] = useState('');
  const [editorSteps, setEditorSteps] = useState<FollowUpStep[]>([]);
  const [saving, setSaving] = useState(false);

  // Track which field is focused for variable insertion
  const [activeField, setActiveField] = useState<{ stepIndex: number; field: 'subject' | 'body' } | null>(null);
  const subjectRefs = useRef<(HTMLInputElement | null)[]>([]);
  const bodyRefs = useRef<(HTMLTextAreaElement | null)[]>([]);

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ------------------------------------------------------------------
  // Data loading
  // ------------------------------------------------------------------

  const loadData = useCallback(async () => {
    try {
      let data = await getAllSequences();

      // Seed default sequences if none exist
      if (data.length === 0) {
        const defaults = createDefaultSequences();
        for (const seq of defaults) {
          await addSequence(seq);
        }
        data = defaults;
      }

      setSequences(data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    } catch (err) {
      console.error('Failed to load sequences:', err);
      addToast('Failed to load sequences', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ------------------------------------------------------------------
  // Editor open / close
  // ------------------------------------------------------------------

  function openEditor(sequence?: FollowUpSequence) {
    if (sequence) {
      setEditingSequence(sequence);
      setEditorName(sequence.name);
      setEditorSteps(sequence.steps.map(s => ({ ...s })));
    } else {
      setEditingSequence(null);
      setEditorName('');
      setEditorSteps([createBlankStep()]);
    }
    setActiveField(null);
    setEditorOpen(true);
  }

  function closeEditor() {
    setEditorOpen(false);
    setEditingSequence(null);
    setEditorName('');
    setEditorSteps([]);
    setActiveField(null);
  }

  // ------------------------------------------------------------------
  // Step manipulation
  // ------------------------------------------------------------------

  function updateStep(index: number, patch: Partial<FollowUpStep>) {
    setEditorSteps(prev => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function addStep() {
    setEditorSteps(prev => [...prev, createBlankStep()]);
  }

  function removeStep(index: number) {
    if (editorSteps.length <= 1) {
      addToast('A sequence must have at least one step', 'error');
      return;
    }
    setEditorSteps(prev => prev.filter((_, i) => i !== index));
  }

  function moveStep(index: number, direction: 'up' | 'down') {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= editorSteps.length) return;
    setEditorSteps(prev => {
      const next = [...prev];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  }

  // ------------------------------------------------------------------
  // Variable insertion
  // ------------------------------------------------------------------

  function insertVariable(token: string) {
    if (!activeField) {
      addToast('Click on a subject or body field first', 'info');
      return;
    }

    const { stepIndex, field } = activeField;

    if (field === 'subject') {
      const input = subjectRefs.current[stepIndex];
      if (input) {
        const start = input.selectionStart ?? input.value.length;
        const end = input.selectionEnd ?? start;
        const newValue = input.value.slice(0, start) + token + input.value.slice(end);
        updateStep(stepIndex, { subject: newValue });
        // Restore cursor position after React re-render
        requestAnimationFrame(() => {
          input.focus();
          const newPos = start + token.length;
          input.setSelectionRange(newPos, newPos);
        });
      }
    } else {
      const textarea = bodyRefs.current[stepIndex];
      if (textarea) {
        const start = textarea.selectionStart ?? textarea.value.length;
        const end = textarea.selectionEnd ?? start;
        const newValue = textarea.value.slice(0, start) + token + textarea.value.slice(end);
        updateStep(stepIndex, { body: newValue });
        requestAnimationFrame(() => {
          textarea.focus();
          const newPos = start + token.length;
          textarea.setSelectionRange(newPos, newPos);
        });
      }
    }
  }

  // ------------------------------------------------------------------
  // Save
  // ------------------------------------------------------------------

  async function handleSave() {
    if (!editorName.trim()) {
      addToast('Please enter a sequence name', 'error');
      return;
    }
    if (editorSteps.length === 0) {
      addToast('Add at least one step', 'error');
      return;
    }
    for (let i = 0; i < editorSteps.length; i++) {
      const step = editorSteps[i];
      if (!step.subject.trim() || !step.body.trim()) {
        addToast(`Step ${i + 1} is missing a subject or body`, 'error');
        return;
      }
      if (step.delayDays < 1) {
        addToast(`Step ${i + 1} delay must be at least 1 day`, 'error');
        return;
      }
    }

    setSaving(true);
    try {
      if (editingSequence) {
        const updated: FollowUpSequence = {
          ...editingSequence,
          name: editorName.trim(),
          steps: editorSteps,
        };
        await updateSequence(updated);
        addToast('Sequence updated');
      } else {
        const newSeq: FollowUpSequence = {
          id: generateId(),
          name: editorName.trim(),
          steps: editorSteps,
          isActive: false,
          createdAt: new Date().toISOString(),
        };
        await addSequence(newSeq);
        addToast('Sequence created');
      }
      closeEditor();
      loadData();
    } catch {
      addToast('Failed to save sequence', 'error');
    } finally {
      setSaving(false);
    }
  }

  // ------------------------------------------------------------------
  // Toggle active
  // ------------------------------------------------------------------

  async function handleToggleActive(sequence: FollowUpSequence) {
    try {
      if (sequence.isActive) {
        // Deactivate
        await updateSequence({ ...sequence, isActive: false });
        addToast(`"${sequence.name}" deactivated`);
      } else {
        // Deactivate all others first, then activate this one
        const currentActive = sequences.find(s => s.isActive);
        if (currentActive) {
          await updateSequence({ ...currentActive, isActive: false });
        }
        await updateSequence({ ...sequence, isActive: true });
        addToast(`"${sequence.name}" is now the active sequence`);
      }
      loadData();
    } catch {
      addToast('Failed to update sequence', 'error');
    }
  }

  // ------------------------------------------------------------------
  // Delete
  // ------------------------------------------------------------------

  async function handleDelete(id: string) {
    try {
      await deleteSequence(id);
      addToast('Sequence deleted');
      setDeletingId(null);
      loadData();
    } catch {
      addToast('Failed to delete sequence', 'error');
    }
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Follow-up Sequences</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Automate follow-up emails when leads don&apos;t respond
          </p>
        </div>
        <button
          onClick={() => openEditor()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
        >
          + Create New Sequence
        </button>
      </div>

      {/* Active sequence banner */}
      {sequences.some(s => s.isActive) && (
        <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl flex items-center gap-3">
          <span className="text-green-600 dark:text-green-400">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </span>
          <p className="text-sm text-green-800 dark:text-green-300">
            <span className="font-semibold">{sequences.find(s => s.isActive)?.name}</span> is the active sequence and will be used for automated follow-ups.
          </p>
        </div>
      )}

      {/* Sequence Cards */}
      {sequences.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4">
          <span className="text-5xl mb-4">🔄</span>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">No Sequences Yet</h3>
          <p className="text-gray-600 dark:text-gray-400 text-center max-w-md mb-6">
            Create follow-up sequences to automatically send emails when leads don&apos;t respond.
          </p>
          <button
            onClick={() => openEditor()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Create Sequence
          </button>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sequences.map(sequence => (
            <div
              key={sequence.id}
              className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 hover:shadow-md transition-shadow"
            >
              {/* Card header */}
              <div className="flex items-start justify-between mb-4">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                    {sequence.name}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                    {sequence.steps.length} step{sequence.steps.length !== 1 ? 's' : ''}
                  </p>
                </div>

                {/* Active toggle */}
                <button
                  onClick={() => handleToggleActive(sequence)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    sequence.isActive
                      ? 'bg-green-500'
                      : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                  role="switch"
                  aria-checked={sequence.isActive}
                  aria-label={`Toggle ${sequence.name} ${sequence.isActive ? 'off' : 'on'}`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      sequence.isActive ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Steps preview */}
              <div className="space-y-2 mb-4">
                {sequence.steps.map((step, i) => (
                  <div
                    key={step.id}
                    className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400"
                  >
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-bold text-[10px] shrink-0">
                      {i + 1}
                    </span>
                    <span className="truncate">
                      Day {step.delayDays} &middot;{' '}
                      {CONDITIONS.find(c => c.value === step.condition)?.label || step.condition} &middot;{' '}
                      &ldquo;{step.subject}&rdquo;
                    </span>
                  </div>
                ))}
              </div>

              {/* Status badge */}
              <div className="mb-4">
                <span
                  className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                    sequence.isActive
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                      : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                  }`}
                >
                  {sequence.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>

              {/* Card actions */}
              <div className="flex items-center justify-between border-t border-gray-100 dark:border-gray-800 pt-3">
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {new Date(sequence.createdAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => openEditor(sequence)}
                    className="px-2 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setDeletingId(sequence.id)}
                    className="px-2 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ================================================================ */}
      {/* Sequence Editor Modal                                            */}
      {/* ================================================================ */}
      <Modal
        isOpen={editorOpen}
        onClose={closeEditor}
        title={editingSequence ? 'Edit Sequence' : 'Create New Sequence'}
        size="xl"
      >
        <div className="space-y-6">
          {/* Sequence name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Sequence Name *
            </label>
            <input
              type="text"
              value={editorName}
              onChange={e => setEditorName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
              placeholder="e.g., Standard 3-Step Follow-up"
            />
          </div>

          {/* Variable buttons */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Insert Variable
            </label>
            <div className="flex flex-wrap gap-1.5">
              {VARIABLES.map(v => (
                <button
                  key={v.token}
                  type="button"
                  onClick={() => insertVariable(v.token)}
                  className="px-2.5 py-1 text-xs font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors border border-blue-200 dark:border-blue-800"
                >
                  {v.label}
                </button>
              ))}
            </div>
            {!activeField && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
                Click on a subject or body field, then click a variable to insert it.
              </p>
            )}
          </div>

          {/* Steps */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Steps ({editorSteps.length})
              </label>
              <button
                type="button"
                onClick={addStep}
                className="px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded-lg transition-colors"
              >
                + Add Step
              </button>
            </div>

            <div className="space-y-4">
              {editorSteps.map((step, index) => (
                <div
                  key={step.id}
                  className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 bg-gray-50 dark:bg-gray-800/50"
                >
                  {/* Step header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="flex items-center justify-center w-7 h-7 rounded-full bg-blue-600 text-white font-bold text-sm">
                        {index + 1}
                      </span>
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">
                        Step {index + 1}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {index > 0 && (
                        <button
                          type="button"
                          onClick={() => moveStep(index, 'up')}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                          title="Move up"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                          </svg>
                        </button>
                      )}
                      {index < editorSteps.length - 1 && (
                        <button
                          type="button"
                          onClick={() => moveStep(index, 'down')}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                          title="Move down"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removeStep(index)}
                        className="p-1.5 rounded-lg text-red-400 hover:text-red-600 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20"
                        title="Remove step"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Delay & Condition row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        Delay (days after {index === 0 ? 'initial email' : 'previous step'})
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={step.delayDays}
                        onChange={e => updateStep(index, { delayDays: Math.max(1, parseInt(e.target.value) || 1) })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        Condition
                      </label>
                      <select
                        value={step.condition}
                        onChange={e => updateStep(index, { condition: e.target.value as FollowUpStep['condition'] })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      >
                        {CONDITIONS.map(c => (
                          <option key={c.value} value={c.value}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Subject */}
                  <div className="mb-3">
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Subject Line
                    </label>
                    <input
                      ref={el => { subjectRefs.current[index] = el; }}
                      type="text"
                      value={step.subject}
                      onChange={e => updateStep(index, { subject: e.target.value })}
                      onFocus={() => setActiveField({ stepIndex: index, field: 'subject' })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      placeholder="e.g., Following up - {business_name}"
                    />
                  </div>

                  {/* Body */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Email Body
                    </label>
                    <textarea
                      ref={el => { bodyRefs.current[index] = el; }}
                      value={step.body}
                      onChange={e => updateStep(index, { body: e.target.value })}
                      onFocus={() => setActiveField({ stepIndex: index, field: 'body' })}
                      rows={5}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm resize-y"
                      placeholder="Write your follow-up email body here..."
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={addStep}
              className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              + Add Another Step
            </button>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={closeEditor}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : editingSequence ? 'Update Sequence' : 'Create Sequence'}
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* ================================================================ */}
      {/* Delete Confirmation Modal                                        */}
      {/* ================================================================ */}
      <Modal
        isOpen={!!deletingId}
        onClose={() => setDeletingId(null)}
        title="Delete Sequence"
        size="sm"
      >
        <div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
            Are you sure you want to delete this sequence? This action cannot be undone.
          </p>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setDeletingId(null)}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => deletingId && handleDelete(deletingId)}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
