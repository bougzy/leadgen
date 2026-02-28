'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type {
  SocialContent,
  SocialContentTemplate,
  SocialPlatform,
  Account,
} from '@/types';
import { SOCIAL_PLATFORMS } from '@/types';
import {
  getAccount,
  getSocialContentsByAccount,
  addSocialContent,
  updateSocialContent,
  deleteSocialContent,
  getAllSocialContentTemplates,
  addSocialContentTemplate,
} from '@/lib/db';
import { BUILT_IN_SOCIAL_TEMPLATES } from '@/lib/client-templates';
import { getHashtagSuggestions } from '@/lib/hashtag-suggestions';
import { generateId } from '@/lib/utils';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Modal from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

type TabKey = 'calendar' | 'templates';

// ─── Badge helpers ─────────────────────────────────────────────
const PLATFORM_BADGE: Record<string, string> = {
  instagram: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
  facebook: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
  nextdoor: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  google: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  twitter: 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200',
  linkedin: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
  all: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  scheduled: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  published: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  missed: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
};

const CATEGORY_LABELS: Record<string, string> = {
  before_after: 'Before/After',
  neighborhood: 'Neighborhood',
  recommendation: 'Recommendation',
  review_repurpose: 'Review Repurpose',
  seasonal_promo: 'Seasonal Promo',
  tip_content: 'Tips & Content',
  service_spotlight: 'Service Spotlight',
};

function platformLabel(platform: SocialPlatform | 'all'): string {
  if (platform === 'all') return 'All Platforms';
  return SOCIAL_PLATFORMS.find(p => p.value === platform)?.label || platform;
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ─── Calendar helpers ──────────────────────────────────────────
function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

// ─── Season helper ─────────────────────────────────────────────
function getCurrentSeason(): string {
  const m = new Date().getMonth();
  if (m >= 2 && m <= 4) return 'Spring';
  if (m >= 5 && m <= 7) return 'Summer';
  if (m >= 8 && m <= 10) return 'Fall';
  return 'Winter';
}

// ─── Post Form ─────────────────────────────────────────────────
interface PostForm {
  platform: SocialPlatform;
  title: string;
  body: string;
  hashtags: string;
  scheduledDate: string;
  templateId: string;
}

const DEFAULT_POST_FORM: PostForm = {
  platform: 'facebook',
  title: '',
  body: '',
  hashtags: '',
  scheduledDate: new Date().toISOString().slice(0, 10),
  templateId: '',
};

// ─── Custom Template Form ──────────────────────────────────────
interface CustomTemplateForm {
  name: string;
  platform: SocialPlatform | 'all';
  category: SocialContentTemplate['category'];
  title: string;
  body: string;
  hashtags: string;
}

const DEFAULT_TEMPLATE_FORM: CustomTemplateForm = {
  name: '',
  platform: 'all',
  category: 'tip_content',
  title: '',
  body: '',
  hashtags: '',
};

// ─────────────────────────────────────────────────────────────────
// PAGE COMPONENT
// ─────────────────────────────────────────────────────────────────
export default function SocialMediaEnginePage() {
  const params = useParams();
  const clientId = params.id as string;
  const { addToast } = useToast();

  // Global state
  const [client, setClient] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('calendar');

  // Content state
  const [posts, setPosts] = useState<SocialContent[]>([]);
  const [templates, setTemplates] = useState<SocialContentTemplate[]>([]);
  const [showPostModal, setShowPostModal] = useState(false);
  const [postForm, setPostForm] = useState<PostForm>(DEFAULT_POST_FORM);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [postSubmitting, setPostSubmitting] = useState(false);

  // Calendar navigation
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());

  // Template tab filters
  const [tplFilterPlatform, setTplFilterPlatform] = useState<SocialPlatform | 'all' | ''>('');
  const [tplFilterCategory, setTplFilterCategory] = useState<string>('');

  // Custom template modal
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateForm, setTemplateForm] = useState<CustomTemplateForm>(DEFAULT_TEMPLATE_FORM);
  const [templateSubmitting, setTemplateSubmitting] = useState(false);

  // Suggested hashtags
  const [suggestedHashtags, setSuggestedHashtags] = useState<string[]>([]);

  // ─── Load data ──────────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      const [siteData, postData, templateData] = await Promise.all([
        getAccount(clientId),
        getSocialContentsByAccount(clientId),
        getAllSocialContentTemplates(),
      ]);
      setClient(siteData || null);
      setPosts(
        postData.sort(
          (a, b) =>
            new Date(b.scheduledDate).getTime() -
            new Date(a.scheduledDate).getTime(),
        ),
      );

      // Merge built-in templates with DB-saved templates
      const builtIn = (BUILT_IN_SOCIAL_TEMPLATES || []) as SocialContentTemplate[];
      const dbIds = new Set(templateData.map((t: SocialContentTemplate) => t.id));
      const merged = [
        ...templateData,
        ...builtIn.filter(t => !dbIds.has(t.id)),
      ];
      setTemplates(merged);
    } catch (err) {
      console.error('Failed to load social data', err);
      addToast('Failed to load data', 'error');
    } finally {
      setLoading(false);
    }
  }, [clientId, addToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ─── Variable substitution ─────────────────────────────────
  function substituteVars(text: string): string {
    if (!client) return text;
    return text
      .replace(/{business_name}/g, client.businessName || '')
      .replace(/{neighborhood}/g, client.location || '')
      .replace(/{service}/g, client.services?.[0] || 'our services')
      .replace(/{phone}/g, client.contactPhone || '')
      .replace(/{email}/g, client.contactEmail || '')
      .replace(/{season}/g, getCurrentSeason())
      .replace(/{location}/g, client.location || '');
  }

  // ─── Hashtag suggestions ───────────────────────────────────
  function updateHashtagSuggestions(platform: SocialPlatform) {
    if (!client) return;
    const suggestions = getHashtagSuggestions(
      platform,
      client.industry || '',
      client.location || '',
      client.services?.[0],
    );
    setSuggestedHashtags(suggestions);
  }

  // ─── Apply template to form ────────────────────────────────
  function applyTemplate(template: SocialContentTemplate) {
    const body = substituteVars(template.body);
    const title = substituteVars(template.title);
    const platform: SocialPlatform =
      template.platform === 'all' ? postForm.platform : template.platform;

    setPostForm(f => ({
      ...f,
      platform,
      title,
      body,
      hashtags: template.hashtags.join(' '),
      templateId: template.id || '',
    }));
    updateHashtagSuggestions(platform);
  }

  // ─── Open new post modal ──────────────────────────────────
  function openNewPostModal() {
    setEditingPostId(null);
    setPostForm(DEFAULT_POST_FORM);
    setSuggestedHashtags([]);
    setShowPostModal(true);
  }

  // ─── Open edit post modal ─────────────────────────────────
  function openEditPostModal(post: SocialContent) {
    setEditingPostId(post.id);
    setPostForm({
      platform: post.platform,
      title: post.title,
      body: post.body,
      hashtags: post.hashtags.join(' '),
      scheduledDate: post.scheduledDate,
      templateId: post.templateId || '',
    });
    updateHashtagSuggestions(post.platform);
    setShowPostModal(true);
  }

  // ─── Save post (add or edit) ──────────────────────────────
  async function handleSavePost() {
    if (!postForm.title.trim() || !postForm.body.trim()) {
      addToast('Title and body are required', 'error');
      return;
    }
    setPostSubmitting(true);
    try {
      const hashtagArr = postForm.hashtags
        .split(/[\s,]+/)
        .map(h => (h.startsWith('#') ? h : h ? `#${h}` : ''))
        .filter(Boolean);

      if (editingPostId) {
        // Update existing
        const existing = posts.find(p => p.id === editingPostId);
        if (!existing) return;
        const updated: SocialContent = {
          ...existing,
          platform: postForm.platform,
          title: postForm.title.trim(),
          body: postForm.body.trim(),
          hashtags: hashtagArr,
          scheduledDate: postForm.scheduledDate,
          templateId: postForm.templateId || undefined,
        };
        await updateSocialContent(updated);
        setPosts(prev =>
          prev
            .map(p => (p.id === editingPostId ? updated : p))
            .sort(
              (a, b) =>
                new Date(b.scheduledDate).getTime() -
                new Date(a.scheduledDate).getTime(),
            ),
        );
        addToast('Post updated');
      } else {
        // Add new
        const newPost: SocialContent = {
          id: generateId(),
          accountId: clientId,
          platform: postForm.platform,
          title: postForm.title.trim(),
          body: postForm.body.trim(),
          hashtags: hashtagArr,
          scheduledDate: postForm.scheduledDate,
          status: 'draft',
          templateId: postForm.templateId || undefined,
          createdAt: new Date().toISOString(),
        };
        await addSocialContent(newPost);
        setPosts(prev =>
          [newPost, ...prev].sort(
            (a, b) =>
              new Date(b.scheduledDate).getTime() -
              new Date(a.scheduledDate).getTime(),
          ),
        );
        addToast('Post created');
      }
      setShowPostModal(false);
      setPostForm(DEFAULT_POST_FORM);
      setEditingPostId(null);
    } catch (err) {
      console.error('Failed to save post', err);
      addToast('Failed to save post', 'error');
    } finally {
      setPostSubmitting(false);
    }
  }

  // ─── Mark published ───────────────────────────────────────
  async function handleMarkPublished(post: SocialContent) {
    const updated: SocialContent = {
      ...post,
      status: 'published',
      publishedAt: new Date().toISOString(),
    };
    try {
      await updateSocialContent(updated);
      setPosts(prev => prev.map(p => (p.id === post.id ? updated : p)));
      addToast('Marked as published');
    } catch {
      addToast('Failed to update post', 'error');
    }
  }

  // ─── Delete post ──────────────────────────────────────────
  async function handleDeletePost(id: string) {
    if (!confirm('Delete this post?')) return;
    try {
      await deleteSocialContent(id);
      setPosts(prev => prev.filter(p => p.id !== id));
      addToast('Post deleted');
    } catch {
      addToast('Failed to delete post', 'error');
    }
  }

  // ─── Copy to clipboard ───────────────────────────────────
  async function handleCopyPost(post: SocialContent) {
    const text = `${post.title}\n\n${post.body}\n\n${post.hashtags.join(' ')}`;
    try {
      await navigator.clipboard.writeText(text);
      addToast('Copied to clipboard');
    } catch {
      addToast('Failed to copy', 'error');
    }
  }

  // ─── Add custom template ─────────────────────────────────
  async function handleAddTemplate() {
    if (!templateForm.name.trim() || !templateForm.body.trim()) {
      addToast('Name and body are required', 'error');
      return;
    }
    setTemplateSubmitting(true);
    try {
      const hashtagArr = templateForm.hashtags
        .split(/[\s,]+/)
        .map(h => (h.startsWith('#') ? h : h ? `#${h}` : ''))
        .filter(Boolean);

      const newTemplate: SocialContentTemplate = {
        id: generateId(),
        name: templateForm.name.trim(),
        platform: templateForm.platform,
        category: templateForm.category,
        title: templateForm.title.trim(),
        body: templateForm.body.trim(),
        hashtags: hashtagArr,
        isBuiltIn: false,
        createdAt: new Date().toISOString(),
      };
      await addSocialContentTemplate(newTemplate);
      setTemplates(prev => [...prev, newTemplate]);
      setShowTemplateModal(false);
      setTemplateForm(DEFAULT_TEMPLATE_FORM);
      addToast('Template created');
    } catch (err) {
      console.error('Failed to add template', err);
      addToast('Failed to create template', 'error');
    } finally {
      setTemplateSubmitting(false);
    }
  }

  // ─── Calendar data ────────────────────────────────────────
  const calendarPosts = useMemo(() => {
    const monthStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}`;
    return posts.filter(p => p.scheduledDate.startsWith(monthStr));
  }, [posts, calYear, calMonth]);

  const postsByDay = useMemo(() => {
    const map: Record<number, SocialContent[]> = {};
    for (const p of calendarPosts) {
      const day = new Date(p.scheduledDate).getDate();
      if (!map[day]) map[day] = [];
      map[day].push(p);
    }
    return map;
  }, [calendarPosts]);

  // ─── Filtered templates ───────────────────────────────────
  const filteredTemplates = useMemo(() => {
    let result = [...templates];
    if (tplFilterPlatform) {
      result = result.filter(
        t => t.platform === tplFilterPlatform || t.platform === 'all',
      );
    }
    if (tplFilterCategory) {
      result = result.filter(t => t.category === tplFilterCategory);
    }
    return result;
  }, [templates, tplFilterPlatform, tplFilterCategory]);

  // ─── Month navigation ────────────────────────────────────
  function prevMonth() {
    if (calMonth === 0) {
      setCalYear(y => y - 1);
      setCalMonth(11);
    } else {
      setCalMonth(m => m - 1);
    }
  }

  function nextMonth() {
    if (calMonth === 11) {
      setCalYear(y => y + 1);
      setCalMonth(0);
    } else {
      setCalMonth(m => m + 1);
    }
  }

  const monthName = new Date(calYear, calMonth).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  // ─── Render ─────────────────────────────────────────────────
  if (loading) return <LoadingSpinner />;

  if (!client) {
    return (
      <div className="p-6">
        <p className="text-gray-500 dark:text-gray-400">Client not found.</p>
        <Link
          href="/clients"
          className="text-blue-600 hover:underline mt-2 inline-block"
        >
          Back to clients
        </Link>
      </div>
    );
  }

  const tabClasses = (key: TabKey) =>
    `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
      activeTab === key
        ? 'bg-blue-600 text-white'
        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
    }`;

  const daysInMonth = getDaysInMonth(calYear, calMonth);
  const firstDay = getFirstDayOfWeek(calYear, calMonth);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link
            href={`/clients/${clientId}`}
            className="text-sm text-blue-600 hover:underline"
          >
            &larr; {client.businessName}
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            Social Media Engine
          </h1>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab('calendar')}
          className={tabClasses('calendar')}
        >
          Content Calendar
        </button>
        <button
          onClick={() => setActiveTab('templates')}
          className={tabClasses('templates')}
        >
          Templates
        </button>
      </div>

      {/* ═══════════ TAB: CONTENT CALENDAR ═══════════ */}
      {activeTab === 'calendar' && (
        <div className="space-y-6">
          {/* Month nav + new post button */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={prevMonth}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white min-w-[180px] text-center">
                {monthName}
              </h2>
              <button
                onClick={nextMonth}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>
            </div>
            <button
              onClick={openNewPostModal}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
            >
              New Post
            </button>
          </div>

          {/* Calendar grid */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            {/* Day headers */}
            <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-700">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                <div
                  key={d}
                  className="px-2 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 text-center"
                >
                  {d}
                </div>
              ))}
            </div>
            {/* Day cells */}
            <div className="grid grid-cols-7">
              {/* Empty cells before first day */}
              {Array.from({ length: firstDay }).map((_, i) => (
                <div
                  key={`empty-${i}`}
                  className="h-20 border-b border-r border-gray-100 dark:border-gray-700/50"
                />
              ))}
              {/* Actual days */}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dayPosts = postsByDay[day] || [];
                const isToday =
                  calYear === new Date().getFullYear() &&
                  calMonth === new Date().getMonth() &&
                  day === new Date().getDate();
                return (
                  <div
                    key={day}
                    className={`h-20 border-b border-r border-gray-100 dark:border-gray-700/50 p-1 ${
                      isToday
                        ? 'bg-blue-50 dark:bg-blue-900/20'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                    }`}
                  >
                    <span
                      className={`text-xs font-medium ${
                        isToday
                          ? 'text-blue-600 dark:text-blue-400'
                          : 'text-gray-600 dark:text-gray-400'
                      }`}
                    >
                      {day}
                    </span>
                    <div className="flex flex-wrap gap-0.5 mt-0.5">
                      {dayPosts.map(p => (
                        <span
                          key={p.id}
                          className={`w-2 h-2 rounded-full ${
                            PLATFORM_BADGE[p.platform]
                              ?.split(' ')[0]
                              ?.replace('bg-', 'bg-') || 'bg-gray-400'
                          }`}
                          title={`${platformLabel(p.platform)}: ${p.title}`}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Post list for selected month */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              Posts for {monthName} ({calendarPosts.length})
            </h3>
            {calendarPosts.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">
                No posts scheduled for this month.
              </p>
            ) : (
              <div className="space-y-3">
                {calendarPosts
                  .sort(
                    (a, b) =>
                      new Date(a.scheduledDate).getTime() -
                      new Date(b.scheduledDate).getTime(),
                  )
                  .map(post => (
                    <div
                      key={post.id}
                      className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          {/* Top row: badges */}
                          <div className="flex items-center gap-2 flex-wrap mb-2">
                            <span
                              className={`px-2 py-0.5 text-xs font-medium rounded-full ${PLATFORM_BADGE[post.platform] || PLATFORM_BADGE.all}`}
                            >
                              {platformLabel(post.platform)}
                            </span>
                            <span
                              className={`px-2 py-0.5 text-xs font-medium rounded-full ${STATUS_BADGE[post.status] || STATUS_BADGE.draft}`}
                            >
                              {post.status.charAt(0).toUpperCase() +
                                post.status.slice(1)}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {fmtDate(post.scheduledDate)}
                            </span>
                          </div>
                          {/* Title */}
                          <p className="font-medium text-gray-900 dark:text-white text-sm mb-1">
                            {post.title}
                          </p>
                          {/* Body preview */}
                          <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                            {post.body}
                          </p>
                          {/* Hashtags */}
                          {post.hashtags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {post.hashtags.map((h, i) => (
                                <span
                                  key={i}
                                  className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full"
                                >
                                  {h}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        {/* Actions */}
                        <div className="flex flex-col gap-1 flex-shrink-0">
                          <button
                            onClick={() => openEditPostModal(post)}
                            className="px-3 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                          >
                            Edit
                          </button>
                          {post.status !== 'published' && (
                            <button
                              onClick={() => handleMarkPublished(post)}
                              className="px-3 py-1 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700"
                            >
                              Mark Published
                            </button>
                          )}
                          <button
                            onClick={() => handleCopyPost(post)}
                            className="px-3 py-1 text-xs bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-800"
                          >
                            Copy to Clipboard
                          </button>
                          <button
                            onClick={() => handleDeletePost(post.id)}
                            className="px-3 py-1 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════ TAB: TEMPLATES ═══════════ */}
      {activeTab === 'templates' && (
        <div className="space-y-4">
          {/* Action bar */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => {
                setTemplateForm(DEFAULT_TEMPLATE_FORM);
                setShowTemplateModal(true);
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
            >
              Create Custom Template
            </button>
            {/* Filter by platform */}
            <select
              value={tplFilterPlatform}
              onChange={e =>
                setTplFilterPlatform(
                  e.target.value as SocialPlatform | 'all' | '',
                )
              }
              className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              <option value="">All Platforms</option>
              <option value="all">Multi-Platform</option>
              {SOCIAL_PLATFORMS.map(p => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            {/* Filter by category */}
            <select
              value={tplFilterCategory}
              onChange={e => setTplFilterCategory(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              <option value="">All Categories</option>
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {filteredTemplates.length} template
              {filteredTemplates.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Template grid */}
          {filteredTemplates.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <p className="text-lg font-medium">No templates found</p>
              <p className="text-sm mt-1">Adjust filters or create a custom template.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTemplates.map((tpl, idx) => (
                <div
                  key={tpl.id || `tpl-${idx}`}
                  className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex flex-col"
                >
                  {/* Template badges */}
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span
                      className={`px-2 py-0.5 text-xs font-medium rounded-full ${PLATFORM_BADGE[tpl.platform] || PLATFORM_BADGE.all}`}
                    >
                      {platformLabel(tpl.platform)}
                    </span>
                    <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                      {CATEGORY_LABELS[tpl.category] || tpl.category}
                    </span>
                    {tpl.isBuiltIn && (
                      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-200">
                        Built-in
                      </span>
                    )}
                  </div>
                  {/* Name */}
                  <h4 className="font-medium text-gray-900 dark:text-white text-sm mb-1">
                    {tpl.name}
                  </h4>
                  {/* Body preview */}
                  <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-3 flex-1">
                    {tpl.body}
                  </p>
                  {/* Hashtags */}
                  {tpl.hashtags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {tpl.hashtags.map((h, i) => (
                        <span
                          key={i}
                          className="px-1.5 py-0.5 text-[10px] bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded"
                        >
                          {h}
                        </span>
                      ))}
                    </div>
                  )}
                  {/* Use Template button */}
                  <button
                    onClick={() => {
                      applyTemplate(tpl);
                      setActiveTab('calendar');
                      setShowPostModal(true);
                    }}
                    className="mt-3 w-full px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                  >
                    Use Template
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══════════ NEW/EDIT POST MODAL ═══════════ */}
      <Modal
        isOpen={showPostModal}
        onClose={() => {
          setShowPostModal(false);
          setEditingPostId(null);
        }}
        title={editingPostId ? 'Edit Post' : 'New Post'}
        size="lg"
      >
        <div className="space-y-4">
          {/* Template selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Template (optional)
            </label>
            <select
              value={postForm.templateId}
              onChange={e => {
                const tplId = e.target.value;
                if (tplId) {
                  const tpl = templates.find(t => t.id === tplId);
                  if (tpl) applyTemplate(tpl);
                }
                setPostForm(f => ({ ...f, templateId: tplId }));
              }}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              <option value="">None — start from scratch</option>
              {templates.map((tpl, idx) => (
                <option key={tpl.id || `t-${idx}`} value={tpl.id || ''}>
                  {tpl.name} ({platformLabel(tpl.platform)})
                </option>
              ))}
            </select>
          </div>
          {/* Platform */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Platform
            </label>
            <select
              value={postForm.platform}
              onChange={e => {
                const p = e.target.value as SocialPlatform;
                setPostForm(f => ({ ...f, platform: p }));
                updateHashtagSuggestions(p);
              }}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              {SOCIAL_PLATFORMS.map(p => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Title
            </label>
            <input
              type="text"
              value={postForm.title}
              onChange={e =>
                setPostForm(f => ({ ...f, title: e.target.value }))
              }
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              placeholder="Post title"
            />
          </div>
          {/* Body */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Body
            </label>
            <textarea
              value={postForm.body}
              onChange={e =>
                setPostForm(f => ({ ...f, body: e.target.value }))
              }
              rows={5}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              placeholder="Write your post content..."
            />
          </div>
          {/* Hashtags */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Hashtags
            </label>
            <input
              type="text"
              value={postForm.hashtags}
              onChange={e =>
                setPostForm(f => ({ ...f, hashtags: e.target.value }))
              }
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              placeholder="#hashtag1 #hashtag2"
            />
            {/* Suggested hashtags */}
            {suggestedHashtags.length > 0 && (
              <div className="mt-2">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                  Suggested:
                </p>
                <div className="flex flex-wrap gap-1">
                  {suggestedHashtags.map((h, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        const current = postForm.hashtags.trim();
                        if (!current.includes(h)) {
                          setPostForm(f => ({
                            ...f,
                            hashtags: current ? `${current} ${h}` : h,
                          }));
                        }
                      }}
                      className="px-2 py-0.5 text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full hover:bg-blue-100 dark:hover:bg-blue-900/50"
                    >
                      {h}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          {/* Scheduled date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Scheduled Date
            </label>
            <input
              type="date"
              value={postForm.scheduledDate}
              onChange={e =>
                setPostForm(f => ({ ...f, scheduledDate: e.target.value }))
              }
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
          </div>
          {/* Submit */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => {
                setShowPostModal(false);
                setEditingPostId(null);
              }}
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={handleSavePost}
              disabled={postSubmitting}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
            >
              {postSubmitting
                ? 'Saving...'
                : editingPostId
                  ? 'Update Post'
                  : 'Create Post'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ═══════════ CREATE CUSTOM TEMPLATE MODAL ═══════════ */}
      <Modal
        isOpen={showTemplateModal}
        onClose={() => setShowTemplateModal(false)}
        title="Create Custom Template"
        size="lg"
      >
        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Template Name
            </label>
            <input
              type="text"
              value={templateForm.name}
              onChange={e =>
                setTemplateForm(f => ({ ...f, name: e.target.value }))
              }
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              placeholder="My Custom Template"
            />
          </div>
          {/* Platform */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Platform
            </label>
            <select
              value={templateForm.platform}
              onChange={e =>
                setTemplateForm(f => ({
                  ...f,
                  platform: e.target.value as SocialPlatform | 'all',
                }))
              }
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              <option value="all">All Platforms</option>
              {SOCIAL_PLATFORMS.map(p => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Category
            </label>
            <select
              value={templateForm.category}
              onChange={e =>
                setTemplateForm(f => ({
                  ...f,
                  category: e.target.value as SocialContentTemplate['category'],
                }))
              }
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Title
            </label>
            <input
              type="text"
              value={templateForm.title}
              onChange={e =>
                setTemplateForm(f => ({ ...f, title: e.target.value }))
              }
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              placeholder="Template title (use {business_name}, {service}, etc.)"
            />
          </div>
          {/* Body */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Body
            </label>
            <textarea
              value={templateForm.body}
              onChange={e =>
                setTemplateForm(f => ({ ...f, body: e.target.value }))
              }
              rows={5}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              placeholder="Template body content. Use variables: {business_name}, {neighborhood}, {service}, {season}, {phone}, {email}"
            />
          </div>
          {/* Hashtags */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Hashtags
            </label>
            <input
              type="text"
              value={templateForm.hashtags}
              onChange={e =>
                setTemplateForm(f => ({ ...f, hashtags: e.target.value }))
              }
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              placeholder="#hashtag1 #hashtag2"
            />
          </div>
          {/* Submit */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => setShowTemplateModal(false)}
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={handleAddTemplate}
              disabled={templateSubmitting}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
            >
              {templateSubmitting ? 'Creating...' : 'Create Template'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
