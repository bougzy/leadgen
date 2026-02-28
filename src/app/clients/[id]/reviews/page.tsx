'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { ClientReview, ReviewPlatform, SocialContent, Account } from '@/types';
import { REVIEW_PLATFORMS } from '@/types';
import {
  getAccount,
  getClientReviewsByAccount,
  addClientReview,
  updateClientReview,
  deleteClientReview,
  addSocialContent,
} from '@/lib/db';
import { REVIEW_RESPONSE_TEMPLATES } from '@/lib/client-templates';
import { generateId, formatDate } from '@/lib/utils';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Modal from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import {
  LineChart,
  BarChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

type TabKey = 'all' | 'negative' | 'velocity';

// ─── Badge helpers ─────────────────────────────────────────────
const PLATFORM_BADGE: Record<string, string> = {
  google: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  yelp: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  homestars: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  facebook: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
  bbb: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  homeadvisor: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
  houzz: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  other: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

const RESPONSE_STATUS_BADGE: Record<string, string> = {
  none: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  needs_response: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  draft: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  posted: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
};

function platformLabel(platform: ReviewPlatform): string {
  return REVIEW_PLATFORMS.find(p => p.value === platform)?.label || platform;
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function renderStars(rating: number) {
  return (
    <span className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <svg
          key={i}
          className={`w-4 h-4 ${i <= rating ? 'text-yellow-400' : 'text-gray-300 dark:text-gray-600'}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.957a1 1 0 00.95.69h4.162c.969 0 1.371 1.24.588 1.81l-3.37 2.448a1 1 0 00-.364 1.118l1.287 3.957c.3.921-.755 1.688-1.54 1.118l-3.37-2.448a1 1 0 00-1.176 0l-3.37 2.448c-.784.57-1.838-.197-1.539-1.118l1.287-3.957a1 1 0 00-.364-1.118L2.063 9.384c-.783-.57-.38-1.81.588-1.81h4.162a1 1 0 00.95-.69l1.286-3.957z" />
        </svg>
      ))}
    </span>
  );
}

function clickableStars(
  value: number,
  onChange: (v: number) => void,
) {
  return (
    <span className="inline-flex gap-1">
      {[1, 2, 3, 4, 5].map(i => (
        <button
          key={i}
          type="button"
          onClick={() => onChange(i)}
          className="focus:outline-none"
        >
          <svg
            className={`w-6 h-6 ${i <= value ? 'text-yellow-400' : 'text-gray-300 dark:text-gray-600'} cursor-pointer hover:text-yellow-300`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.957a1 1 0 00.95.69h4.162c.969 0 1.371 1.24.588 1.81l-3.37 2.448a1 1 0 00-.364 1.118l1.287 3.957c.3.921-.755 1.688-1.54 1.118l-3.37-2.448a1 1 0 00-1.176 0l-3.37 2.448c-.784.57-1.838-.197-1.539-1.118l1.287-3.957a1 1 0 00-.364-1.118L2.063 9.384c-.783-.57-.38-1.81.588-1.81h4.162a1 1 0 00.95-.69l1.286-3.957z" />
          </svg>
        </button>
      ))}
    </span>
  );
}

// ─── Review Form ───────────────────────────────────────────────
interface ReviewForm {
  platform: ReviewPlatform;
  reviewerName: string;
  rating: number;
  reviewText: string;
  reviewDate: string;
}

const DEFAULT_REVIEW_FORM: ReviewForm = {
  platform: 'google',
  reviewerName: '',
  rating: 5,
  reviewText: '',
  reviewDate: new Date().toISOString().slice(0, 10),
};

// ─── Month helpers for velocity ────────────────────────────────
function getMonthKey(d: string): string {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthLabel(key: string): string {
  const [y, m] = key.split('-');
  const dt = new Date(Number(y), Number(m) - 1);
  return dt.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function getLast12Months(): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

// ─────────────────────────────────────────────────────────────────
// PAGE COMPONENT
// ─────────────────────────────────────────────────────────────────
export default function ReviewManagementPage() {
  const params = useParams();
  const clientId = params.id as string;
  const { addToast } = useToast();

  // Global state
  const [client, setClient] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('all');

  // Reviews state
  const [reviews, setReviews] = useState<ClientReview[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [reviewForm, setReviewForm] = useState<ReviewForm>(DEFAULT_REVIEW_FORM);
  const [submitting, setSubmitting] = useState(false);

  // Filters
  const [filterPlatform, setFilterPlatform] = useState<ReviewPlatform | ''>('');
  const [filterRating, setFilterRating] = useState<number | ''>('');

  // ─── Load data ──────────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      const [siteData, reviewData] = await Promise.all([
        getAccount(clientId),
        getClientReviewsByAccount(clientId),
      ]);
      setClient(siteData || null);
      setReviews(
        reviewData.sort(
          (a, b) =>
            new Date(b.reviewDate).getTime() - new Date(a.reviewDate).getTime(),
        ),
      );
    } catch (err) {
      console.error('Failed to load review data', err);
      addToast('Failed to load data', 'error');
    } finally {
      setLoading(false);
    }
  }, [clientId, addToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ─── Filtered reviews ──────────────────────────────────────
  const filteredReviews = useMemo(() => {
    let result = [...reviews];
    if (filterPlatform) {
      result = result.filter(r => r.platform === filterPlatform);
    }
    if (filterRating !== '') {
      result = result.filter(r => r.rating === filterRating);
    }
    return result;
  }, [reviews, filterPlatform, filterRating]);

  // ─── Negative reviews ─────────────────────────────────────
  const negativeReviews = useMemo(() => {
    return reviews
      .filter(r => r.isNegative)
      .sort(
        (a, b) =>
          new Date(b.reviewDate).getTime() - new Date(a.reviewDate).getTime(),
      );
  }, [reviews]);

  // ─── Add review ────────────────────────────────────────────
  async function handleAddReview() {
    if (!reviewForm.reviewerName.trim() || !reviewForm.reviewText.trim()) {
      addToast('Please fill in all required fields', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const newReview: ClientReview = {
        id: generateId(),
        accountId: clientId,
        platform: reviewForm.platform,
        reviewerName: reviewForm.reviewerName.trim(),
        rating: reviewForm.rating,
        reviewText: reviewForm.reviewText.trim(),
        reviewDate: reviewForm.reviewDate || new Date().toISOString().slice(0, 10),
        responseStatus: 'none',
        isNegative: reviewForm.rating <= 3,
        socialPostGenerated: false,
        createdAt: new Date().toISOString(),
      };
      await addClientReview(newReview);
      setReviews(prev =>
        [newReview, ...prev].sort(
          (a, b) =>
            new Date(b.reviewDate).getTime() - new Date(a.reviewDate).getTime(),
        ),
      );
      setShowAddModal(false);
      setReviewForm(DEFAULT_REVIEW_FORM);
      addToast('Review added successfully');
    } catch (err) {
      console.error('Failed to add review', err);
      addToast('Failed to add review', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Draft response ───────────────────────────────────────
  function getResponseTemplate(review: ClientReview): string {
    const category =
      review.rating >= 4 ? 'positive' : review.rating <= 2 ? 'negative' : 'neutral';
    const templates = REVIEW_RESPONSE_TEMPLATES[category];
    const template = templates[Math.floor(Math.random() * templates.length)];
    let text = template;
    text = text.replace(/{reviewer_name}/g, review.reviewerName);
    if (client) {
      text = text.replace(/{phone}/g, client.contactPhone || '');
      text = text.replace(/{email}/g, client.contactEmail || '');
      text = text.replace(/{service}/g, client.services?.[0] || 'our services');
    }
    return text;
  }

  async function handleDraftResponse(review: ClientReview) {
    const draft = getResponseTemplate(review);
    const updated: ClientReview = {
      ...review,
      responseDraftText: draft,
      responseStatus: 'draft',
    };
    try {
      await updateClientReview(updated);
      setReviews(prev => prev.map(r => (r.id === review.id ? updated : r)));
      addToast('Response drafted');
    } catch {
      addToast('Failed to draft response', 'error');
    }
  }

  async function handleMarkPosted(review: ClientReview) {
    const updated: ClientReview = {
      ...review,
      responseText: review.responseDraftText,
      responseStatus: 'posted',
    };
    try {
      await updateClientReview(updated);
      setReviews(prev => prev.map(r => (r.id === review.id ? updated : r)));
      addToast('Marked as posted');
    } catch {
      addToast('Failed to update review', 'error');
    }
  }

  async function handleCopyResponse(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      addToast('Copied to clipboard');
    } catch {
      addToast('Failed to copy', 'error');
    }
  }

  // ─── Delete review ────────────────────────────────────────
  async function handleDeleteReview(id: string) {
    if (!confirm('Delete this review?')) return;
    try {
      await deleteClientReview(id);
      setReviews(prev => prev.filter(r => r.id !== id));
      addToast('Review deleted');
    } catch {
      addToast('Failed to delete review', 'error');
    }
  }

  // ─── Generate social post from 5-star review ─────────────
  async function handleGenerateSocialPost(review: ClientReview) {
    if (!client) return;
    const post: SocialContent = {
      id: generateId(),
      accountId: clientId,
      platform: 'facebook',
      title: '5-Star Review',
      body: `We love hearing from our customers!\n\n"${review.reviewText}"\n— ${review.reviewerName}\n\nThank you for choosing ${client.businessName}! We're dedicated to providing the best ${client.services?.[0] || 'service'} in ${client.location}.`,
      hashtags: ['#5stars', '#customerlove', '#testimonial', '#supportlocal'],
      scheduledDate: new Date().toISOString().slice(0, 10),
      status: 'draft',
      linkedReviewId: review.id,
      createdAt: new Date().toISOString(),
    };
    try {
      await addSocialContent(post);
      const updated: ClientReview = { ...review, socialPostGenerated: true };
      await updateClientReview(updated);
      setReviews(prev => prev.map(r => (r.id === review.id ? updated : r)));
      addToast('Social post draft created');
    } catch {
      addToast('Failed to create social post', 'error');
    }
  }

  // ─── Velocity calculations ────────────────────────────────
  const velocityData = useMemo(() => {
    const months = getLast12Months();
    const now = new Date();
    const thisMonthKey = getMonthKey(now.toISOString());
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthKey = getMonthKey(lastMonth.toISOString());

    // Count per month
    const countByMonth: Record<string, number> = {};
    const ratingsByMonth: Record<string, number[]> = {};
    const ratingDist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

    for (const m of months) {
      countByMonth[m] = 0;
      ratingsByMonth[m] = [];
    }

    for (const r of reviews) {
      const mk = getMonthKey(r.reviewDate);
      if (countByMonth[mk] !== undefined) {
        countByMonth[mk]++;
        ratingsByMonth[mk].push(r.rating);
      }
      if (r.rating >= 1 && r.rating <= 5) {
        ratingDist[r.rating]++;
      }
    }

    const totalReviews = reviews.length;
    const avgRating =
      totalReviews > 0
        ? reviews.reduce((s, r) => s + r.rating, 0) / totalReviews
        : 0;
    const thisMonthCount = countByMonth[thisMonthKey] || 0;
    const lastMonthCount = countByMonth[lastMonthKey] || 0;

    // Monthly velocity (avg reviews per month over last 6 months with reviews)
    const last6 = months.slice(-6);
    const totalLast6 = last6.reduce((s, m) => s + (countByMonth[m] || 0), 0);
    const avgPerMonth = totalLast6 / 6;

    // Projection: reach next milestone
    const milestones = [25, 50, 100, 150, 200, 300, 500];
    const nextMilestone = milestones.find(m => m > totalReviews) || totalReviews + 100;
    const monthsToMilestone =
      avgPerMonth > 0 ? Math.ceil((nextMilestone - totalReviews) / avgPerMonth) : null;
    const projectionDate = monthsToMilestone
      ? new Date(
          now.getFullYear(),
          now.getMonth() + monthsToMilestone,
          1,
        ).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      : null;

    // Chart data
    const lineData = months.map(m => ({
      month: getMonthLabel(m),
      reviews: countByMonth[m] || 0,
    }));

    const barData = months.map(m => {
      const ratings = ratingsByMonth[m];
      const avg =
        ratings.length > 0
          ? ratings.reduce((s, v) => s + v, 0) / ratings.length
          : 0;
      return {
        month: getMonthLabel(m),
        avgRating: Number(avg.toFixed(2)),
      };
    });

    return {
      totalReviews,
      avgRating,
      thisMonthCount,
      lastMonthCount,
      avgPerMonth,
      nextMilestone,
      projectionDate,
      lineData,
      barData,
      ratingDist,
    };
  }, [reviews]);

  // ─── Render helpers ─────────────────────────────────────────

  function renderResponseSection(review: ClientReview) {
    if (review.responseStatus === 'posted') {
      return (
        <div className="mt-3 pl-4 border-l-2 border-green-400">
          <p className="text-xs font-medium text-green-700 dark:text-green-400 mb-1">
            Response (Posted)
          </p>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            {review.responseText}
          </p>
        </div>
      );
    }
    if (review.responseStatus === 'draft' && review.responseDraftText) {
      return (
        <div className="mt-3 pl-4 border-l-2 border-yellow-400">
          <p className="text-xs font-medium text-yellow-700 dark:text-yellow-400 mb-1">
            Draft Response
          </p>
          <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
            {review.responseDraftText}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => handleCopyResponse(review.responseDraftText!)}
              className="px-3 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              Copy
            </button>
            <button
              onClick={() => handleMarkPosted(review)}
              className="px-3 py-1 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              Mark as Posted
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="mt-3">
        <button
          onClick={() => handleDraftResponse(review)}
          className="px-3 py-1 text-xs bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-800"
        >
          Draft Response
        </button>
      </div>
    );
  }

  function renderReviewCard(review: ClientReview) {
    return (
      <div
        key={review.id}
        className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {/* Top row: platform badge, reviewer name, rating */}
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <span
                className={`px-2 py-0.5 text-xs font-medium rounded-full ${PLATFORM_BADGE[review.platform] || PLATFORM_BADGE.other}`}
              >
                {platformLabel(review.platform)}
              </span>
              <span className="font-medium text-gray-900 dark:text-white text-sm">
                {review.reviewerName}
              </span>
              {renderStars(review.rating)}
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {fmtDate(review.reviewDate)}
              </span>
            </div>
            {/* Review text */}
            <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
              {review.reviewText}
            </p>
            {/* Response section */}
            {renderResponseSection(review)}
          </div>
          {/* Action buttons */}
          <div className="flex flex-col gap-1 flex-shrink-0">
            {review.rating === 5 && !review.socialPostGenerated && (
              <button
                onClick={() => handleGenerateSocialPost(review)}
                className="px-2 py-1 text-xs bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-200 rounded-lg hover:bg-purple-200 dark:hover:bg-purple-800 whitespace-nowrap"
              >
                Generate Social Post
              </button>
            )}
            {review.rating === 5 && review.socialPostGenerated && (
              <span className="px-2 py-1 text-xs bg-purple-50 text-purple-500 dark:bg-purple-900/30 dark:text-purple-400 rounded-lg">
                Social Post Created
              </span>
            )}
            <button
              onClick={() => handleDeleteReview(review.id)}
              className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    );
  }

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
            Review Management
          </h1>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab('all')}
          className={tabClasses('all')}
        >
          All Reviews
        </button>
        <button
          onClick={() => setActiveTab('negative')}
          className={tabClasses('negative')}
        >
          Negative Alerts
          {negativeReviews.length > 0 && (
            <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-red-500 text-white rounded-full">
              {negativeReviews.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('velocity')}
          className={tabClasses('velocity')}
        >
          Velocity Dashboard
        </button>
      </div>

      {/* ═══════════ TAB: ALL REVIEWS ═══════════ */}
      {activeTab === 'all' && (
        <div className="space-y-4">
          {/* Action bar */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => {
                setReviewForm(DEFAULT_REVIEW_FORM);
                setShowAddModal(true);
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
            >
              Add Review
            </button>
            {/* Filter by platform */}
            <select
              value={filterPlatform}
              onChange={e =>
                setFilterPlatform(e.target.value as ReviewPlatform | '')
              }
              className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              <option value="">All Platforms</option>
              {REVIEW_PLATFORMS.map(p => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            {/* Filter by rating */}
            <select
              value={filterRating}
              onChange={e =>
                setFilterRating(
                  e.target.value === '' ? '' : Number(e.target.value),
                )
              }
              className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              <option value="">All Ratings</option>
              {[5, 4, 3, 2, 1].map(r => (
                <option key={r} value={r}>
                  {r} Star{r !== 1 ? 's' : ''}
                </option>
              ))}
            </select>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {filteredReviews.length} review
              {filteredReviews.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Review list */}
          {filteredReviews.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <p className="text-lg font-medium">No reviews found</p>
              <p className="text-sm mt-1">
                Add your first review or adjust filters.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredReviews.map(review => renderReviewCard(review))}
            </div>
          )}
        </div>
      )}

      {/* ═══════════ TAB: NEGATIVE ALERTS ═══════════ */}
      {activeTab === 'negative' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Negative Review Alerts
            </h2>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {negativeReviews.length} alert
              {negativeReviews.length !== 1 ? 's' : ''}
            </span>
          </div>

          {negativeReviews.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <p className="text-lg font-medium">No negative reviews</p>
              <p className="text-sm mt-1">
                Reviews with 3 stars or below will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {negativeReviews.map(review => (
                <div
                  key={review.id}
                  className="bg-white dark:bg-gray-800 rounded-xl border border-red-200 dark:border-red-800/50 p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {/* Top row */}
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <span
                          className={`px-2 py-0.5 text-xs font-medium rounded-full ${PLATFORM_BADGE[review.platform] || PLATFORM_BADGE.other}`}
                        >
                          {platformLabel(review.platform)}
                        </span>
                        <span className="font-medium text-gray-900 dark:text-white text-sm">
                          {review.reviewerName}
                        </span>
                        {renderStars(review.rating)}
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {fmtDate(review.reviewDate)}
                        </span>
                        {/* Status badge */}
                        <span
                          className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                            review.responseStatus === 'posted'
                              ? RESPONSE_STATUS_BADGE.posted
                              : review.responseStatus === 'draft'
                                ? RESPONSE_STATUS_BADGE.draft
                                : RESPONSE_STATUS_BADGE.needs_response
                          }`}
                        >
                          {review.responseStatus === 'posted'
                            ? 'Posted'
                            : review.responseStatus === 'draft'
                              ? 'Draft'
                              : 'Needs Response'}
                        </span>
                      </div>
                      {/* Review text */}
                      <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap mb-3">
                        {review.reviewText}
                      </p>
                      {/* Auto-drafted response */}
                      {review.responseStatus === 'none' && (
                        <div className="mt-2 pl-4 border-l-2 border-red-300 dark:border-red-700">
                          <p className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">
                            Suggested Response
                          </p>
                          <p className="text-sm text-gray-600 dark:text-gray-400 italic mb-2">
                            {getResponseTemplate(review)}
                          </p>
                          <button
                            onClick={() => handleDraftResponse(review)}
                            className="px-3 py-1 text-xs bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200 rounded-lg hover:bg-red-200 dark:hover:bg-red-800"
                          >
                            Save as Draft
                          </button>
                        </div>
                      )}
                      {review.responseStatus === 'draft' &&
                        review.responseDraftText && (
                          <div className="mt-2 pl-4 border-l-2 border-yellow-400">
                            <p className="text-xs font-medium text-yellow-700 dark:text-yellow-400 mb-1">
                              Draft Response
                            </p>
                            <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                              {review.responseDraftText}
                            </p>
                            <div className="flex gap-2">
                              <button
                                onClick={() =>
                                  handleCopyResponse(review.responseDraftText!)
                                }
                                className="px-3 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                              >
                                Copy Response
                              </button>
                              <button
                                onClick={() => handleMarkPosted(review)}
                                className="px-3 py-1 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700"
                              >
                                Mark as Posted
                              </button>
                            </div>
                          </div>
                        )}
                      {review.responseStatus === 'posted' && (
                        <div className="mt-2 pl-4 border-l-2 border-green-400">
                          <p className="text-xs font-medium text-green-700 dark:text-green-400 mb-1">
                            Response (Posted)
                          </p>
                          <p className="text-sm text-gray-700 dark:text-gray-300">
                            {review.responseText}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══════════ TAB: VELOCITY DASHBOARD ═══════════ */}
      {activeTab === 'velocity' && (
        <div className="space-y-6">
          {/* Metric cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Total Reviews
              </p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                {velocityData.totalReviews}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Avg Rating
              </p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                {velocityData.avgRating > 0
                  ? velocityData.avgRating.toFixed(1)
                  : '—'}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                This Month
              </p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                {velocityData.thisMonthCount}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Last Month
              </p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                {velocityData.lastMonthCount}
              </p>
            </div>
          </div>

          {/* Projection */}
          {velocityData.projectionDate && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                At current velocity ({velocityData.avgPerMonth.toFixed(1)}{' '}
                reviews/month), you will reach{' '}
                <span className="font-bold">
                  {velocityData.nextMilestone} reviews
                </span>{' '}
                by{' '}
                <span className="font-bold">{velocityData.projectionDate}</span>.
              </p>
            </div>
          )}

          {/* Line chart: reviews per month */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
              Reviews Per Month (Last 12 Months)
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={velocityData.lineData}>
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 11 }}
                    stroke="#9ca3af"
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11 }}
                    stroke="#9ca3af"
                  />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="reviews"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={{ fill: '#3b82f6', r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Bar chart: avg rating per month */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
              Average Rating Per Month (Last 12 Months)
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={velocityData.barData}>
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 11 }}
                    stroke="#9ca3af"
                  />
                  <YAxis
                    domain={[0, 5]}
                    ticks={[1, 2, 3, 4, 5]}
                    tick={{ fontSize: 11 }}
                    stroke="#9ca3af"
                  />
                  <Tooltip />
                  <Bar dataKey="avgRating" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Rating distribution */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
              Rating Distribution
            </h3>
            <div className="space-y-3">
              {[5, 4, 3, 2, 1].map(star => {
                const count = velocityData.ratingDist[star] || 0;
                const pct =
                  velocityData.totalReviews > 0
                    ? (count / velocityData.totalReviews) * 100
                    : 0;
                return (
                  <div key={star} className="flex items-center gap-3">
                    <span className="text-sm text-gray-600 dark:text-gray-400 w-12">
                      {star} star{star !== 1 ? 's' : ''}
                    </span>
                    <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                      <div
                        className={`h-3 rounded-full ${
                          star >= 4
                            ? 'bg-green-500'
                            : star === 3
                              ? 'bg-yellow-500'
                              : 'bg-red-500'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-sm text-gray-600 dark:text-gray-400 w-16 text-right">
                      {count} ({pct.toFixed(0)}%)
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ ADD REVIEW MODAL ═══════════ */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add Review"
        size="lg"
      >
        <div className="space-y-4">
          {/* Platform */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Platform
            </label>
            <select
              value={reviewForm.platform}
              onChange={e =>
                setReviewForm(f => ({
                  ...f,
                  platform: e.target.value as ReviewPlatform,
                }))
              }
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              {REVIEW_PLATFORMS.map(p => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          {/* Reviewer name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Reviewer Name
            </label>
            <input
              type="text"
              value={reviewForm.reviewerName}
              onChange={e =>
                setReviewForm(f => ({ ...f, reviewerName: e.target.value }))
              }
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              placeholder="Customer name"
            />
          </div>
          {/* Rating */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Rating
            </label>
            {clickableStars(reviewForm.rating, v =>
              setReviewForm(f => ({ ...f, rating: v })),
            )}
          </div>
          {/* Review text */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Review Text
            </label>
            <textarea
              value={reviewForm.reviewText}
              onChange={e =>
                setReviewForm(f => ({ ...f, reviewText: e.target.value }))
              }
              rows={4}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              placeholder="The review text..."
            />
          </div>
          {/* Review date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Review Date
            </label>
            <input
              type="date"
              value={reviewForm.reviewDate}
              onChange={e =>
                setReviewForm(f => ({ ...f, reviewDate: e.target.value }))
              }
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
          </div>
          {/* Submit */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => setShowAddModal(false)}
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={handleAddReview}
              disabled={submitting}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
            >
              {submitting ? 'Adding...' : 'Add Review'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
