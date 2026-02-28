'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { GbpAudit, GbpPost, GbpPostTemplate, ReviewRequest, GbpAuditIssue, Account } from '@/types';
import {
  getAccount,
  getGbpAuditsByAccount,
  addGbpAudit,
  updateGbpAudit,
  getGbpPostsByAccount,
  addGbpPost,
  updateGbpPost,
  deleteGbpPost,
  getAllGbpPostTemplates,
  getReviewRequestsByAccount,
  addReviewRequest,
  updateReviewRequest,
} from '@/lib/db';
import { calculateGbpAuditScore } from '@/lib/gbp-scoring';
import { BUILT_IN_GBP_POST_TEMPLATES } from '@/lib/client-templates';
import { generateId } from '@/lib/utils';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Modal from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

type TabKey = 'audit' | 'posts' | 'requests';

// ─── Severity helpers ──────────────────────────────────────────
const SEVERITY_BADGE: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  high: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  low: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  scheduled: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  published: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  missed: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
};

const REQUEST_STATUS_BADGE: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  initial_sent: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  followup_sent: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  completed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  declined: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
};

function scoreColor(score: number): string {
  if (score >= 70) return 'text-green-600 dark:text-green-400';
  if (score >= 40) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-red-600 dark:text-red-400';
}

function scoreBgColor(score: number): string {
  if (score >= 70) return 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800';
  if (score >= 40) return 'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800';
  return 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800';
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Default Audit Form State ──────────────────────────────────
interface AuditForm {
  reviewCount: number;
  averageRating: number;
  photoCount: number;
  postFrequency: GbpAudit['postFrequency'];
  servicesListed: boolean;
  hoursSet: boolean;
  bookingEnabled: boolean;
  qAndAActive: boolean;
  categoriesSet: boolean;
  descriptionLength: number;
  websiteLinked: boolean;
  phoneCorrect: boolean;
  addressCorrect: boolean;
  coverPhotoSet: boolean;
  logoSet: boolean;
}

const DEFAULT_AUDIT: AuditForm = {
  reviewCount: 0,
  averageRating: 0,
  photoCount: 0,
  postFrequency: 'none',
  servicesListed: false,
  hoursSet: false,
  bookingEnabled: false,
  qAndAActive: false,
  categoriesSet: false,
  descriptionLength: 0,
  websiteLinked: false,
  phoneCorrect: false,
  addressCorrect: false,
  coverPhotoSet: false,
  logoSet: false,
};

// ─── Default Post Form State ───────────────────────────────────
interface PostForm {
  title: string;
  body: string;
  postType: GbpPost['postType'];
  callToAction: string;
  ctaUrl: string;
  scheduledDate: string;
}

const DEFAULT_POST: PostForm = {
  title: '',
  body: '',
  postType: 'update',
  callToAction: '',
  ctaUrl: '',
  scheduledDate: '',
};

// ─── Default Review Request Form ───────────────────────────────
interface RequestForm {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  jobDate: string;
  jobDescription: string;
}

const DEFAULT_REQUEST: RequestForm = {
  customerName: '',
  customerEmail: '',
  customerPhone: '',
  jobDate: '',
  jobDescription: '',
};

// ─────────────────────────────────────────────────────────────────
// PAGE COMPONENT
// ─────────────────────────────────────────────────────────────────
export default function GbpManagerPage() {
  const params = useParams();
  const clientId = params.id as string;
  const { addToast } = useToast();

  // Global state
  const [client, setClient] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('audit');

  // Audit state
  const [audits, setAudits] = useState<GbpAudit[]>([]);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [auditForm, setAuditForm] = useState<AuditForm>(DEFAULT_AUDIT);
  const [auditSubmitting, setAuditSubmitting] = useState(false);

  // Posts state
  const [posts, setPosts] = useState<GbpPost[]>([]);
  const [templates, setTemplates] = useState<GbpPostTemplate[]>([]);
  const [showPostModal, setShowPostModal] = useState(false);
  const [postForm, setPostForm] = useState<PostForm>(DEFAULT_POST);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [postSubmitting, setPostSubmitting] = useState(false);

  // Review Requests state
  const [requests, setRequests] = useState<ReviewRequest[]>([]);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestForm, setRequestForm] = useState<RequestForm>(DEFAULT_REQUEST);
  const [requestSubmitting, setRequestSubmitting] = useState(false);

  // ─── Load data ──────────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      const [siteData, auditData, postData, templateData, requestData] = await Promise.all([
        getAccount(clientId),
        getGbpAuditsByAccount(clientId),
        getGbpPostsByAccount(clientId),
        getAllGbpPostTemplates(),
        getReviewRequestsByAccount(clientId),
      ]);
      setClient(siteData || null);
      setAudits(auditData.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      setPosts(postData.sort((a, b) => new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime()));

      // Merge built-in templates with any DB-saved templates
      const builtIn = (BUILT_IN_GBP_POST_TEMPLATES || []) as GbpPostTemplate[];
      const dbIds = new Set(templateData.map((t: GbpPostTemplate) => t.id));
      const merged = [...templateData, ...builtIn.filter(t => !dbIds.has(t.id))];
      setTemplates(merged);

      setRequests(requestData.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    } catch (err) {
      console.error('Failed to load GBP data', err);
      addToast('Failed to load data', 'error');
    } finally {
      setLoading(false);
    }
  }, [clientId, addToast]);

  useEffect(() => { loadData(); }, [loadData]);

  // ─── Helpers ────────────────────────────────────────────────
  const latestAudit = audits[0] || null;

  function substituteVars(text: string): string {
    if (!client) return text;
    return text
      .replace(/\{business_name\}/g, client.businessName)
      .replace(/\{location\}/g, client.location)
      .replace(/\{industry\}/g, client.industry)
      .replace(/\{contact_name\}/g, client.contactName || '');
  }

  // ─── Audit handlers ────────────────────────────────────────
  async function handleAuditSubmit() {
    setAuditSubmitting(true);
    try {
      const { score, issues } = calculateGbpAuditScore(auditForm);
      const audit: GbpAudit = {
        id: generateId(),
        accountId: clientId,
        ...auditForm,
        auditScore: score,
        issues,
        createdAt: new Date().toISOString(),
      };
      await addGbpAudit(audit);
      setAudits(prev => [audit, ...prev]);
      setShowAuditModal(false);
      setAuditForm(DEFAULT_AUDIT);
      addToast('Audit saved successfully', 'success');
    } catch {
      addToast('Failed to save audit', 'error');
    } finally {
      setAuditSubmitting(false);
    }
  }

  async function toggleIssueResolved(auditId: string, issueId: string) {
    const audit = audits.find(a => a.id === auditId);
    if (!audit) return;
    const updated: GbpAudit = {
      ...audit,
      issues: audit.issues.map(i => i.id === issueId ? { ...i, resolved: !i.resolved } : i),
    };
    try {
      await updateGbpAudit(updated);
      setAudits(prev => prev.map(a => a.id === auditId ? updated : a));
    } catch {
      addToast('Failed to update issue', 'error');
    }
  }

  // ─── Post handlers ─────────────────────────────────────────
  function handleTemplateSelect(templateId: string) {
    setSelectedTemplateId(templateId);
    if (!templateId) return;
    const tpl = templates.find(t => t.id === templateId);
    if (tpl) {
      setPostForm(prev => ({
        ...prev,
        title: tpl.title,
        body: tpl.body,
        callToAction: tpl.callToAction || '',
      }));
    }
  }

  async function handlePostSubmit() {
    if (!postForm.title.trim() || !postForm.body.trim()) {
      addToast('Title and body are required', 'error');
      return;
    }
    setPostSubmitting(true);
    try {
      const post: GbpPost = {
        id: generateId(),
        accountId: clientId,
        templateId: selectedTemplateId || undefined,
        title: postForm.title,
        body: postForm.body,
        callToAction: postForm.callToAction || undefined,
        ctaUrl: postForm.ctaUrl || undefined,
        postType: postForm.postType,
        scheduledDate: postForm.scheduledDate || new Date().toISOString(),
        status: postForm.scheduledDate ? 'scheduled' : 'draft',
        createdAt: new Date().toISOString(),
      };
      await addGbpPost(post);
      setPosts(prev => [post, ...prev].sort((a, b) => new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime()));
      setShowPostModal(false);
      setPostForm(DEFAULT_POST);
      setSelectedTemplateId('');
      addToast('Post created successfully', 'success');
    } catch {
      addToast('Failed to create post', 'error');
    } finally {
      setPostSubmitting(false);
    }
  }

  async function handleMarkPublished(postId: string) {
    const post = posts.find(p => p.id === postId);
    if (!post) return;
    const updated: GbpPost = { ...post, status: 'published', publishedAt: new Date().toISOString() };
    try {
      await updateGbpPost(updated);
      setPosts(prev => prev.map(p => p.id === postId ? updated : p));
      addToast('Marked as published', 'success');
    } catch {
      addToast('Failed to update post', 'error');
    }
  }

  async function handleDeletePost(postId: string) {
    try {
      await deleteGbpPost(postId);
      setPosts(prev => prev.filter(p => p.id !== postId));
      addToast('Post deleted', 'success');
    } catch {
      addToast('Failed to delete post', 'error');
    }
  }

  // ─── Review Request handlers ────────────────────────────────
  function buildReviewLink(): string {
    if (client?.gbpUrl) {
      const base = client.gbpUrl.replace(/\/+$/, '');
      return `${base}/review`;
    }
    return '';
  }

  async function handleRequestSubmit() {
    if (!requestForm.customerName.trim()) {
      addToast('Customer name is required', 'error');
      return;
    }
    setRequestSubmitting(true);
    try {
      const req: ReviewRequest = {
        id: generateId(),
        accountId: clientId,
        customerName: requestForm.customerName,
        customerEmail: requestForm.customerEmail || undefined,
        customerPhone: requestForm.customerPhone || undefined,
        jobDate: requestForm.jobDate || new Date().toISOString().split('T')[0],
        jobDescription: requestForm.jobDescription,
        reviewLink: buildReviewLink(),
        status: 'pending',
        createdAt: new Date().toISOString(),
      };
      await addReviewRequest(req);
      setRequests(prev => [req, ...prev]);
      setShowRequestModal(false);
      setRequestForm(DEFAULT_REQUEST);
      addToast('Review request created', 'success');
    } catch {
      addToast('Failed to create request', 'error');
    } finally {
      setRequestSubmitting(false);
    }
  }

  async function handleMarkCompleted(reqId: string) {
    const req = requests.find(r => r.id === reqId);
    if (!req) return;
    const updated: ReviewRequest = { ...req, status: 'completed', reviewReceivedAt: new Date().toISOString() };
    try {
      await updateReviewRequest(updated);
      setRequests(prev => prev.map(r => r.id === reqId ? updated : r));
      addToast('Marked as completed', 'success');
    } catch {
      addToast('Failed to update request', 'error');
    }
  }

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
      <div className="flex items-center justify-between">
        <div>
          <Link href={`/clients/${clientId}`} className="text-sm text-blue-600 hover:underline">
            &larr; {client.businessName}
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">GBP Manager</h1>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button onClick={() => setActiveTab('audit')} className={tabClasses('audit')}>Audit</button>
        <button onClick={() => setActiveTab('posts')} className={tabClasses('posts')}>Posts</button>
        <button onClick={() => setActiveTab('requests')} className={tabClasses('requests')}>Review Requests</button>
      </div>

      {/* ═══════════ TAB: AUDIT ═══════════ */}
      {activeTab === 'audit' && (
        <div className="space-y-6">
          {/* Action bar */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">GBP Audit</h2>
            <button
              onClick={() => setShowAuditModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
            >
              Run New Audit
            </button>
          </div>

          {/* Latest audit score card */}
          {latestAudit && (
            <div className={`border rounded-xl p-6 ${scoreBgColor(latestAudit.auditScore)}`}>
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <div className={`text-5xl font-bold ${scoreColor(latestAudit.auditScore)}`}>
                    {latestAudit.auditScore}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">/ 100</div>
                </div>
                <div className="flex-1">
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Last audited {formatDate(latestAudit.createdAt)}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {latestAudit.issues.filter(i => !i.resolved).length} unresolved issue{latestAudit.issues.filter(i => !i.resolved).length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Issues list */}
          {latestAudit && latestAudit.issues.length > 0 && (
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h3 className="font-semibold text-gray-900 dark:text-white">Issues</h3>
              </div>
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {latestAudit.issues.map(issue => (
                  <div key={issue.id} className={`px-6 py-4 flex items-start gap-4 ${issue.resolved ? 'opacity-50' : ''}`}>
                    <input
                      type="checkbox"
                      checked={issue.resolved}
                      onChange={() => toggleIssueResolved(latestAudit.id, issue.id)}
                      className="mt-1 h-4 w-4 rounded border-gray-300"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${SEVERITY_BADGE[issue.severity]}`}>
                          {issue.severity}
                        </span>
                        <span className={`text-sm font-medium ${issue.resolved ? 'line-through text-gray-400' : 'text-gray-900 dark:text-white'}`}>
                          {issue.message}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{issue.recommendation}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Audit history */}
          {audits.length > 1 && (
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h3 className="font-semibold text-gray-900 dark:text-white">Audit History</h3>
              </div>
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {audits.slice(1).map(audit => (
                  <div key={audit.id} className="px-6 py-3 flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-300">{formatDate(audit.createdAt)}</span>
                    <span className={`text-lg font-bold ${scoreColor(audit.auditScore)}`}>{audit.auditScore}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {audit.issues.length} issue{audit.issues.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {audits.length === 0 && (
            <div className="text-center py-12 text-gray-400 dark:text-gray-500">
              <p className="text-lg">No audits yet</p>
              <p className="text-sm mt-1">Run your first audit to see your GBP score.</p>
            </div>
          )}

          {/* ── Audit Modal ── */}
          <Modal isOpen={showAuditModal} onClose={() => setShowAuditModal(false)} title="Run New GBP Audit" size="lg">
            <div className="space-y-5">
              {/* Number fields */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Review Count</label>
                  <input
                    type="number" min={0}
                    value={auditForm.reviewCount}
                    onChange={e => setAuditForm(f => ({ ...f, reviewCount: +e.target.value }))}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Avg Rating (0-5)</label>
                  <input
                    type="number" min={0} max={5} step={0.1}
                    value={auditForm.averageRating}
                    onChange={e => setAuditForm(f => ({ ...f, averageRating: +e.target.value }))}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Photo Count</label>
                  <input
                    type="number" min={0}
                    value={auditForm.photoCount}
                    onChange={e => setAuditForm(f => ({ ...f, photoCount: +e.target.value }))}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Post frequency + description length */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Post Frequency</label>
                  <select
                    value={auditForm.postFrequency}
                    onChange={e => setAuditForm(f => ({ ...f, postFrequency: e.target.value as GbpAudit['postFrequency'] }))}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="none">None</option>
                    <option value="rarely">Rarely</option>
                    <option value="monthly">Monthly</option>
                    <option value="weekly">Weekly</option>
                    <option value="daily">Daily</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description Length (chars)</label>
                  <input
                    type="number" min={0}
                    value={auditForm.descriptionLength}
                    onChange={e => setAuditForm(f => ({ ...f, descriptionLength: +e.target.value }))}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Checkboxes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Profile Completeness</label>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    ['servicesListed', 'Services listed'],
                    ['hoursSet', 'Hours set'],
                    ['bookingEnabled', 'Booking enabled'],
                    ['qAndAActive', 'Q&A active'],
                    ['categoriesSet', 'Categories set'],
                    ['websiteLinked', 'Website linked'],
                    ['phoneCorrect', 'Phone correct'],
                    ['addressCorrect', 'Address correct'],
                    ['coverPhotoSet', 'Cover photo'],
                    ['logoSet', 'Logo'],
                  ] as [keyof AuditForm, string][]).map(([field, label]) => (
                    <label key={field} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={auditForm[field] as boolean}
                        onChange={e => setAuditForm(f => ({ ...f, [field]: e.target.checked }))}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setShowAuditModal(false)}
                  className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAuditSubmit}
                  disabled={auditSubmitting}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50"
                >
                  {auditSubmitting ? 'Saving...' : 'Run Audit'}
                </button>
              </div>
            </div>
          </Modal>
        </div>
      )}

      {/* ═══════════ TAB: POSTS ═══════════ */}
      {activeTab === 'posts' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">GBP Posts</h2>
            <button
              onClick={() => setShowPostModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
            >
              New Post
            </button>
          </div>

          {/* Post list */}
          {posts.length > 0 ? (
            <div className="space-y-3">
              {posts.map(post => (
                <div key={post.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium text-gray-900 dark:text-white truncate">{post.title}</h3>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[post.status]}`}>
                          {post.status}
                        </span>
                        <span className="text-xs text-gray-400 dark:text-gray-500 capitalize">{post.postType}</span>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">{post.body}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                        {post.scheduledDate ? formatDate(post.scheduledDate) : 'No date'}
                        {post.callToAction && <> &middot; CTA: {post.callToAction}</>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {post.status !== 'published' && (
                        <button
                          onClick={() => handleMarkPublished(post.id)}
                          className="px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 dark:bg-green-900/30 dark:text-green-300 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/50"
                        >
                          Mark Published
                        </button>
                      )}
                      <button
                        onClick={() => handleDeletePost(post.id)}
                        className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 dark:bg-red-900/30 dark:text-red-300 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/50"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-400 dark:text-gray-500">
              <p className="text-lg">No posts yet</p>
              <p className="text-sm mt-1">Create your first GBP post to keep the profile active.</p>
            </div>
          )}

          {/* ── Post Modal ── */}
          <Modal isOpen={showPostModal} onClose={() => { setShowPostModal(false); setPostForm(DEFAULT_POST); setSelectedTemplateId(''); }} title="New GBP Post" size="lg">
            <div className="space-y-4">
              {/* Template selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Template</label>
                <select
                  value={selectedTemplateId}
                  onChange={e => handleTemplateSelect(e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="">-- No template --</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.category})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
                  <input
                    type="text"
                    value={postForm.title}
                    onChange={e => setPostForm(f => ({ ...f, title: e.target.value }))}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="Post title"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Post Type</label>
                  <select
                    value={postForm.postType}
                    onChange={e => setPostForm(f => ({ ...f, postType: e.target.value as GbpPost['postType'] }))}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="update">Update</option>
                    <option value="offer">Offer</option>
                    <option value="event">Event</option>
                    <option value="product">Product</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Body</label>
                <textarea
                  rows={5}
                  value={postForm.body}
                  onChange={e => setPostForm(f => ({ ...f, body: e.target.value }))}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="Post content..."
                />
              </div>

              {/* Variable substitution preview */}
              {postForm.body && postForm.body.includes('{') && (
                <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Preview (with variables replaced)</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{substituteVars(postForm.body)}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">CTA Text</label>
                  <input
                    type="text"
                    value={postForm.callToAction}
                    onChange={e => setPostForm(f => ({ ...f, callToAction: e.target.value }))}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="e.g. Book Now"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">CTA URL</label>
                  <input
                    type="url"
                    value={postForm.ctaUrl}
                    onChange={e => setPostForm(f => ({ ...f, ctaUrl: e.target.value }))}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="https://..."
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Scheduled Date</label>
                <input
                  type="date"
                  value={postForm.scheduledDate}
                  onChange={e => setPostForm(f => ({ ...f, scheduledDate: e.target.value }))}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => { setShowPostModal(false); setPostForm(DEFAULT_POST); setSelectedTemplateId(''); }}
                  className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePostSubmit}
                  disabled={postSubmitting}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50"
                >
                  {postSubmitting ? 'Creating...' : 'Create Post'}
                </button>
              </div>
            </div>
          </Modal>
        </div>
      )}

      {/* ═══════════ TAB: REVIEW REQUESTS ═══════════ */}
      {activeTab === 'requests' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Review Requests</h2>
            <button
              onClick={() => setShowRequestModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
            >
              New Request
            </button>
          </div>

          {/* Review link preview */}
          {client.gbpUrl && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
              <p className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-1">Auto-generated review link</p>
              <p className="text-sm text-blue-800 dark:text-blue-300 break-all">{buildReviewLink()}</p>
            </div>
          )}

          {/* Requests list */}
          {requests.length > 0 ? (
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Customer</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Contact</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Job Date</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Status</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {requests.map(req => (
                    <tr key={req.id}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 dark:text-white">{req.customerName}</div>
                        {req.jobDescription && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[200px]">{req.jobDescription}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                        {req.customerEmail && <div className="text-xs">{req.customerEmail}</div>}
                        {req.customerPhone && <div className="text-xs">{req.customerPhone}</div>}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                        {req.jobDate ? formatDate(req.jobDate) : '-'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${REQUEST_STATUS_BADGE[req.status]}`}>
                          {req.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {req.status !== 'completed' && req.status !== 'declined' && (
                          <button
                            onClick={() => handleMarkCompleted(req.id)}
                            className="text-xs font-medium text-green-600 hover:text-green-700 dark:text-green-400"
                          >
                            Mark Completed
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12 text-gray-400 dark:text-gray-500">
              <p className="text-lg">No review requests yet</p>
              <p className="text-sm mt-1">Send your first review request to start collecting reviews.</p>
            </div>
          )}

          {/* ── Request Modal ── */}
          <Modal isOpen={showRequestModal} onClose={() => setShowRequestModal(false)} title="New Review Request" size="md">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Customer Name *</label>
                <input
                  type="text"
                  value={requestForm.customerName}
                  onChange={e => setRequestForm(f => ({ ...f, customerName: e.target.value }))}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="John Smith"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                  <input
                    type="email"
                    value={requestForm.customerEmail}
                    onChange={e => setRequestForm(f => ({ ...f, customerEmail: e.target.value }))}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="john@example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={requestForm.customerPhone}
                    onChange={e => setRequestForm(f => ({ ...f, customerPhone: e.target.value }))}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="555-123-4567"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Job Date</label>
                <input
                  type="date"
                  value={requestForm.jobDate}
                  onChange={e => setRequestForm(f => ({ ...f, jobDate: e.target.value }))}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Job Description</label>
                <textarea
                  rows={3}
                  value={requestForm.jobDescription}
                  onChange={e => setRequestForm(f => ({ ...f, jobDescription: e.target.value }))}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="Brief description of work completed..."
                />
              </div>

              {/* Review link preview */}
              {client.gbpUrl && (
                <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Review link that will be used</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300 break-all">{buildReviewLink()}</p>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setShowRequestModal(false)}
                  className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRequestSubmit}
                  disabled={requestSubmitting}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50"
                >
                  {requestSubmitting ? 'Creating...' : 'Create Request'}
                </button>
              </div>
            </div>
          </Modal>
        </div>
      )}
    </div>
  );
}
