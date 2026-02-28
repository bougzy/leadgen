'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { ClientCustomer, ReferralRecord, RetentionReminder, Account } from '@/types';
import {
  getAccount,
  getClientCustomersByAccount,
  addClientCustomer,
  updateClientCustomer,
  deleteClientCustomer,
  getReferralsByAccount,
  addReferralRecord,
  updateReferralRecord,
  getRetentionRemindersByAccount,
  addRetentionReminder,
  updateRetentionReminder,
  deleteRetentionReminder,
} from '@/lib/db';
import { generateReferralCode } from '@/lib/referral-codes';
import { RETENTION_TEMPLATES } from '@/lib/client-templates';
import { generateId, formatDate } from '@/lib/utils';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Modal from '@/components/ui/Modal';
import Pagination from '@/components/ui/Pagination';
import EmptyState from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';

// ─── Types ─────────────────────────────────────────────────────
type TabKey = 'customers' | 'referrals' | 'reminders';
type SortField = 'name' | 'lastJobDate' | 'totalRevenue';
type SortDir = 'asc' | 'desc';

type ReminderType = RetentionReminder['reminderType'];

// ─── Helpers ───────────────────────────────────────────────────
const REFERRAL_STATUS_BADGE: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  contacted: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  converted: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  expired: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
};

const REMINDER_TYPE_BADGE: Record<string, string> = {
  seasonal_refresh: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  maintenance: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  followup: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  anniversary: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
};

const REMINDER_TYPE_LABELS: Record<string, string> = {
  seasonal_refresh: 'Seasonal Refresh',
  maintenance: 'Maintenance',
  followup: 'Follow-up',
  anniversary: 'Anniversary',
};

const REMINDER_STATUS_BADGE: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  sent: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  cancelled: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

function isOverdue(scheduledDate: string, status: string): boolean {
  if (status !== 'pending') return false;
  return new Date(scheduledDate) < new Date();
}

function substituteVars(text: string, vars: Record<string, string>): string {
  let result = text;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{${key}}`, value);
  }
  return result;
}

function getCurrentSeason(): string {
  const month = new Date().getMonth();
  if (month >= 2 && month <= 4) return 'Spring';
  if (month >= 5 && month <= 7) return 'Summer';
  if (month >= 8 && month <= 10) return 'Fall';
  return 'Winter';
}

// ─── Customer form defaults ────────────────────────────────────
interface CustomerForm {
  name: string;
  email: string;
  phone: string;
  address: string;
  firstJobDate: string;
  lastJobDate: string;
  totalJobs: number;
  totalRevenue: number;
  notes: string;
}

const DEFAULT_CUSTOMER_FORM: CustomerForm = {
  name: '',
  email: '',
  phone: '',
  address: '',
  firstJobDate: '',
  lastJobDate: '',
  totalJobs: 0,
  totalRevenue: 0,
  notes: '',
};

// ─── Referral form defaults ────────────────────────────────────
interface ReferralForm {
  referrerCustomerId: string;
  referredName: string;
  referredEmail: string;
  referredPhone: string;
}

const DEFAULT_REFERRAL_FORM: ReferralForm = {
  referrerCustomerId: '',
  referredName: '',
  referredEmail: '',
  referredPhone: '',
};

// ─── Reminder form defaults ────────────────────────────────────
interface ReminderForm {
  customerId: string;
  reminderType: ReminderType;
  scheduledDate: string;
  message: string;
}

const DEFAULT_REMINDER_FORM: ReminderForm = {
  customerId: '',
  reminderType: 'seasonal_refresh',
  scheduledDate: '',
  message: '',
};

const ITEMS_PER_PAGE = 10;

// ─── Component ─────────────────────────────────────────────────
export default function RetentionPage() {
  const params = useParams();
  const { addToast } = useToast();
  const id = params.id as string;
  const csvInputRef = useRef<HTMLInputElement>(null);

  // ── Core state ──
  const [client, setClient] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('customers');

  // ── Customer state ──
  const [customers, setCustomers] = useState<ClientCustomer[]>([]);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<ClientCustomer | null>(null);
  const [customerForm, setCustomerForm] = useState<CustomerForm>(DEFAULT_CUSTOMER_FORM);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [customerPage, setCustomerPage] = useState(1);

  // ── Referral state ──
  const [referrals, setReferrals] = useState<ReferralRecord[]>([]);
  const [showReferralModal, setShowReferralModal] = useState(false);
  const [referralForm, setReferralForm] = useState<ReferralForm>(DEFAULT_REFERRAL_FORM);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);

  // ── Reminder state ──
  const [reminders, setReminders] = useState<RetentionReminder[]>([]);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [reminderForm, setReminderForm] = useState<ReminderForm>(DEFAULT_REMINDER_FORM);

  // ── Load data ──
  const loadData = useCallback(async () => {
    try {
      const clientData = await getAccount(id);
      if (!clientData) {
        setNotFound(true);
        return;
      }
      setClient(clientData);

      const [customersData, referralsData, remindersData] = await Promise.all([
        getClientCustomersByAccount(id),
        getReferralsByAccount(id),
        getRetentionRemindersByAccount(id),
      ]);

      setCustomers(customersData);
      setReferrals(referralsData);
      setReminders(remindersData);
    } catch (err) {
      console.error('Failed to load retention data:', err);
      addToast('Failed to load retention data', 'error');
    } finally {
      setLoading(false);
    }
  }, [id, addToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ════════════════════════════════════════════════════════════
  // CUSTOMER HANDLERS
  // ════════════════════════════════════════════════════════════

  function openAddCustomer() {
    setEditingCustomer(null);
    setCustomerForm(DEFAULT_CUSTOMER_FORM);
    setShowCustomerModal(true);
  }

  function openEditCustomer(c: ClientCustomer) {
    setEditingCustomer(c);
    setCustomerForm({
      name: c.name,
      email: c.email ?? '',
      phone: c.phone ?? '',
      address: c.address ?? '',
      firstJobDate: c.firstJobDate ?? '',
      lastJobDate: c.lastJobDate ?? '',
      totalJobs: c.totalJobs,
      totalRevenue: c.totalRevenue,
      notes: c.notes,
    });
    setShowCustomerModal(true);
  }

  async function handleSaveCustomer() {
    if (!customerForm.name.trim()) {
      addToast('Customer name is required', 'error');
      return;
    }

    try {
      if (editingCustomer) {
        const updated: ClientCustomer = {
          ...editingCustomer,
          name: customerForm.name.trim(),
          email: customerForm.email.trim() || undefined,
          phone: customerForm.phone.trim() || undefined,
          address: customerForm.address.trim() || undefined,
          firstJobDate: customerForm.firstJobDate || undefined,
          lastJobDate: customerForm.lastJobDate || undefined,
          totalJobs: customerForm.totalJobs,
          totalRevenue: customerForm.totalRevenue,
          notes: customerForm.notes.trim(),
          updatedAt: new Date().toISOString(),
        };
        await updateClientCustomer(updated);
        setCustomers(prev => prev.map(c => (c.id === updated.id ? updated : c)));
        addToast('Customer updated');
      } else {
        const newCustomer: ClientCustomer = {
          id: generateId(),
          accountId: id,
          name: customerForm.name.trim(),
          email: customerForm.email.trim() || undefined,
          phone: customerForm.phone.trim() || undefined,
          address: customerForm.address.trim() || undefined,
          firstJobDate: customerForm.firstJobDate || undefined,
          lastJobDate: customerForm.lastJobDate || undefined,
          totalJobs: customerForm.totalJobs,
          totalRevenue: customerForm.totalRevenue,
          notes: customerForm.notes.trim(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await addClientCustomer(newCustomer);
        setCustomers(prev => [...prev, newCustomer]);
        addToast('Customer added');
      }
      setShowCustomerModal(false);
    } catch (err) {
      console.error('Failed to save customer:', err);
      addToast('Failed to save customer', 'error');
    }
  }

  async function handleDeleteCustomer(customerId: string) {
    try {
      await deleteClientCustomer(customerId);
      setCustomers(prev => prev.filter(c => c.id !== customerId));
      setDeleteConfirmId(null);
      addToast('Customer deleted');
    } catch (err) {
      console.error('Failed to delete customer:', err);
      addToast('Failed to delete customer', 'error');
    }
  }

  function handleCSVImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split('\n').filter(l => l.trim());
        if (lines.length < 2) {
          addToast('CSV file is empty or has no data rows', 'error');
          return;
        }

        const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
        const nameIdx = headers.findIndex(h => h === 'name' || h === 'customer_name' || h === 'customer');
        const emailIdx = headers.findIndex(h => h === 'email');
        const phoneIdx = headers.findIndex(h => h === 'phone' || h === 'telephone');
        const addressIdx = headers.findIndex(h => h === 'address');
        const firstJobIdx = headers.findIndex(h => h.includes('first') && h.includes('job') || h === 'first_job_date');
        const lastJobIdx = headers.findIndex(h => h.includes('last') && h.includes('job') || h === 'last_job_date');
        const totalJobsIdx = headers.findIndex(h => h === 'total_jobs' || h === 'jobs');
        const revenueIdx = headers.findIndex(h => h === 'total_revenue' || h === 'revenue');
        const notesIdx = headers.findIndex(h => h === 'notes');

        if (nameIdx === -1) {
          addToast('CSV must have a "name" column', 'error');
          return;
        }

        const newCustomers: ClientCustomer[] = [];
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
          const name = cols[nameIdx]?.trim();
          if (!name) continue;

          newCustomers.push({
            id: generateId(),
            accountId: id,
            name,
            email: emailIdx >= 0 ? cols[emailIdx]?.trim() || undefined : undefined,
            phone: phoneIdx >= 0 ? cols[phoneIdx]?.trim() || undefined : undefined,
            address: addressIdx >= 0 ? cols[addressIdx]?.trim() || undefined : undefined,
            firstJobDate: firstJobIdx >= 0 ? cols[firstJobIdx]?.trim() || undefined : undefined,
            lastJobDate: lastJobIdx >= 0 ? cols[lastJobIdx]?.trim() || undefined : undefined,
            totalJobs: totalJobsIdx >= 0 ? parseInt(cols[totalJobsIdx] || '0', 10) || 0 : 0,
            totalRevenue: revenueIdx >= 0 ? parseFloat(cols[revenueIdx] || '0') || 0 : 0,
            notes: notesIdx >= 0 ? cols[notesIdx]?.trim() || '' : '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }

        if (newCustomers.length === 0) {
          addToast('No valid customers found in CSV', 'error');
          return;
        }

        for (const c of newCustomers) {
          await addClientCustomer(c);
        }

        setCustomers(prev => [...prev, ...newCustomers]);
        addToast(`Imported ${newCustomers.length} customers`);
      } catch (err) {
        console.error('CSV import failed:', err);
        addToast('Failed to import CSV', 'error');
      }
    };
    reader.readAsText(file);

    // Reset file input so same file can be re-imported
    if (csvInputRef.current) {
      csvInputRef.current.value = '';
    }
  }

  // ── Sort & paginate customers ──
  const sortedCustomers = [...customers].sort((a, b) => {
    let cmp = 0;
    if (sortField === 'name') {
      cmp = a.name.localeCompare(b.name);
    } else if (sortField === 'lastJobDate') {
      cmp = (a.lastJobDate ?? '').localeCompare(b.lastJobDate ?? '');
    } else if (sortField === 'totalRevenue') {
      cmp = a.totalRevenue - b.totalRevenue;
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const customerTotalPages = Math.max(1, Math.ceil(sortedCustomers.length / ITEMS_PER_PAGE));
  const paginatedCustomers = sortedCustomers.slice(
    (customerPage - 1) * ITEMS_PER_PAGE,
    customerPage * ITEMS_PER_PAGE
  );

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
    setCustomerPage(1);
  }

  function sortIndicator(field: SortField): string {
    if (sortField !== field) return '';
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  }

  // ════════════════════════════════════════════════════════════
  // REFERRAL HANDLERS
  // ════════════════════════════════════════════════════════════

  function openCreateReferral() {
    setReferralForm(DEFAULT_REFERRAL_FORM);
    setGeneratedCode(null);
    setCodeCopied(false);
    setShowReferralModal(true);
  }

  async function handleCreateReferral() {
    if (!referralForm.referrerCustomerId) {
      addToast('Select a referrer customer', 'error');
      return;
    }
    if (!referralForm.referredName.trim()) {
      addToast('Referred person name is required', 'error');
      return;
    }

    const referrer = customers.find(c => c.id === referralForm.referrerCustomerId);
    if (!referrer) {
      addToast('Referrer not found', 'error');
      return;
    }

    try {
      const code = generateReferralCode(client?.businessName ?? 'CLIENT');
      const record: ReferralRecord = {
        id: generateId(),
        accountId: id,
        referrerCustomerId: referralForm.referrerCustomerId,
        referrerName: referrer.name,
        referredName: referralForm.referredName.trim(),
        referredEmail: referralForm.referredEmail.trim() || undefined,
        referredPhone: referralForm.referredPhone.trim() || undefined,
        referralCode: code,
        status: 'pending',
        referrerDiscountApplied: false,
        referredDiscountApplied: false,
        createdAt: new Date().toISOString(),
      };

      await addReferralRecord(record);
      setReferrals(prev => [...prev, record]);
      setGeneratedCode(code);
      addToast('Referral created');
    } catch (err) {
      console.error('Failed to create referral:', err);
      addToast('Failed to create referral', 'error');
    }
  }

  async function handleMarkConverted(ref: ReferralRecord) {
    try {
      const updated: ReferralRecord = {
        ...ref,
        status: 'converted',
        convertedAt: new Date().toISOString(),
      };
      await updateReferralRecord(updated);
      setReferrals(prev => prev.map(r => (r.id === ref.id ? updated : r)));
      addToast('Referral marked as converted');
    } catch (err) {
      console.error('Failed to update referral:', err);
      addToast('Failed to update referral', 'error');
    }
  }

  async function copyReferralCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCodeCopied(true);
      addToast('Referral code copied');
      setTimeout(() => setCodeCopied(false), 2000);
    } catch {
      addToast('Failed to copy code', 'error');
    }
  }

  // Referral stats
  const totalReferrals = referrals.length;
  const convertedReferrals = referrals.filter(r => r.status === 'converted').length;
  const conversionRate = totalReferrals > 0 ? ((convertedReferrals / totalReferrals) * 100).toFixed(1) : '0.0';

  // ════════════════════════════════════════════════════════════
  // REMINDER HANDLERS
  // ════════════════════════════════════════════════════════════

  function openCreateReminder() {
    // Pre-fill message from the default template
    const tplKey: ReminderType = 'seasonal_refresh';
    const tpl = RETENTION_TEMPLATES[tplKey];
    const vars: Record<string, string> = {
      customer_name: '',
      business_name: client?.businessName ?? '',
      service: client?.services?.[0] ?? 'service',
      phone: client?.contactPhone ?? '',
      season: getCurrentSeason(),
    };
    setReminderForm({
      customerId: '',
      reminderType: tplKey,
      scheduledDate: '',
      message: tpl ? substituteVars(tpl.body, vars) : '',
    });
    setShowReminderModal(true);
  }

  function handleReminderTypeChange(type: ReminderType) {
    const tpl = RETENTION_TEMPLATES[type as keyof typeof RETENTION_TEMPLATES];
    const selectedCustomer = customers.find(c => c.id === reminderForm.customerId);
    const vars: Record<string, string> = {
      customer_name: selectedCustomer?.name ?? '',
      business_name: client?.businessName ?? '',
      service: client?.services?.[0] ?? 'service',
      phone: client?.contactPhone ?? '',
      season: getCurrentSeason(),
    };
    setReminderForm(prev => ({
      ...prev,
      reminderType: type,
      message: tpl ? substituteVars(tpl.body, vars) : prev.message,
    }));
  }

  function handleReminderCustomerChange(customerId: string) {
    const selectedCustomer = customers.find(c => c.id === customerId);
    const tpl = RETENTION_TEMPLATES[reminderForm.reminderType as keyof typeof RETENTION_TEMPLATES];
    const vars: Record<string, string> = {
      customer_name: selectedCustomer?.name ?? '',
      business_name: client?.businessName ?? '',
      service: client?.services?.[0] ?? 'service',
      phone: client?.contactPhone ?? '',
      season: getCurrentSeason(),
    };
    setReminderForm(prev => ({
      ...prev,
      customerId,
      message: tpl ? substituteVars(tpl.body, vars) : prev.message,
    }));
  }

  async function handleCreateReminder() {
    if (!reminderForm.customerId) {
      addToast('Select a customer', 'error');
      return;
    }
    if (!reminderForm.scheduledDate) {
      addToast('Scheduled date is required', 'error');
      return;
    }

    const customer = customers.find(c => c.id === reminderForm.customerId);
    if (!customer) {
      addToast('Customer not found', 'error');
      return;
    }

    try {
      const reminder: RetentionReminder = {
        id: generateId(),
        accountId: id,
        customerId: reminderForm.customerId,
        customerName: customer.name,
        customerEmail: customer.email,
        customerPhone: customer.phone,
        reminderType: reminderForm.reminderType,
        scheduledDate: reminderForm.scheduledDate,
        message: reminderForm.message.trim(),
        status: 'pending',
        createdAt: new Date().toISOString(),
      };

      await addRetentionReminder(reminder);
      setReminders(prev => [...prev, reminder]);
      setShowReminderModal(false);
      addToast('Reminder created');
    } catch (err) {
      console.error('Failed to create reminder:', err);
      addToast('Failed to create reminder', 'error');
    }
  }

  async function handleMarkSent(reminder: RetentionReminder) {
    try {
      const updated: RetentionReminder = {
        ...reminder,
        status: 'sent',
        sentAt: new Date().toISOString(),
      };
      await updateRetentionReminder(updated);
      setReminders(prev => prev.map(r => (r.id === reminder.id ? updated : r)));
      addToast('Reminder marked as sent');
    } catch (err) {
      console.error('Failed to update reminder:', err);
      addToast('Failed to update reminder', 'error');
    }
  }

  async function handleCancelReminder(reminder: RetentionReminder) {
    try {
      const updated: RetentionReminder = {
        ...reminder,
        status: 'cancelled',
      };
      await updateRetentionReminder(updated);
      setReminders(prev => prev.map(r => (r.id === reminder.id ? updated : r)));
      addToast('Reminder cancelled');
    } catch (err) {
      console.error('Failed to cancel reminder:', err);
      addToast('Failed to cancel reminder', 'error');
    }
  }

  // Sort reminders: overdue first, then by scheduled date
  const sortedReminders = [...reminders].sort((a, b) => {
    const aOverdue = isOverdue(a.scheduledDate, a.status) ? 0 : 1;
    const bOverdue = isOverdue(b.scheduledDate, b.status) ? 0 : 1;
    if (aOverdue !== bOverdue) return aOverdue - bOverdue;
    return new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime();
  });

  // ── Loading / not found ──
  if (loading) return <LoadingSpinner />;

  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <span className="text-5xl mb-4">🔍</span>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Client Not Found</h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6">This client site does not exist or has been deleted.</p>
        <Link href="/clients" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">
          Back to Clients
        </Link>
      </div>
    );
  }

  if (!client) return null;

  const TABS: { key: TabKey; label: string; icon: string }[] = [
    { key: 'customers', label: 'Customers', icon: '👥' },
    { key: 'referrals', label: 'Referrals', icon: '🤝' },
    { key: 'reminders', label: 'Reminders', icon: '🔔' },
  ];

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
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
          Referral & Retention
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          {client.businessName} — Manage customers, referrals, and retention reminders
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 overflow-x-auto pb-1 mb-6">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === tab.key
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════ */}
      {/* TAB: CUSTOMERS                                        */}
      {/* ══════════════════════════════════════════════════════ */}
      {activeTab === 'customers' && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
          {/* Customers header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Customers ({customers.length})
            </h2>
            <div className="flex gap-2">
              <input
                ref={csvInputRef}
                type="file"
                accept=".csv"
                onChange={handleCSVImport}
                className="hidden"
                id="csv-import"
              />
              <button
                onClick={() => csvInputRef.current?.click()}
                className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                Import CSV
              </button>
              <button
                onClick={openAddCustomer}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Add Customer
              </button>
            </div>
          </div>

          {customers.length === 0 ? (
            <EmptyState
              icon="👥"
              title="No Customers Yet"
              description="Add your first customer manually or import from a CSV file."
              actionLabel="Add Customer"
              onAction={openAddCustomer}
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                      <th
                        className="pb-3 pr-4 font-medium cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none"
                        onClick={() => toggleSort('name')}
                      >
                        Name{sortIndicator('name')}
                      </th>
                      <th className="pb-3 pr-4 font-medium">Email</th>
                      <th className="pb-3 pr-4 font-medium">Phone</th>
                      <th className="pb-3 pr-4 font-medium">First Job</th>
                      <th
                        className="pb-3 pr-4 font-medium cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none"
                        onClick={() => toggleSort('lastJobDate')}
                      >
                        Last Job{sortIndicator('lastJobDate')}
                      </th>
                      <th className="pb-3 pr-4 font-medium text-right">Jobs</th>
                      <th
                        className="pb-3 pr-4 font-medium text-right cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none"
                        onClick={() => toggleSort('totalRevenue')}
                      >
                        Revenue{sortIndicator('totalRevenue')}
                      </th>
                      <th className="pb-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedCustomers.map(c => (
                      <tr
                        key={c.id}
                        className="border-b border-gray-100 dark:border-gray-800 last:border-0"
                      >
                        <td className="py-3 pr-4 font-medium text-gray-900 dark:text-white">
                          {c.name}
                        </td>
                        <td className="py-3 pr-4 text-gray-600 dark:text-gray-400">
                          {c.email || <span className="text-gray-400 dark:text-gray-500 italic">-</span>}
                        </td>
                        <td className="py-3 pr-4 text-gray-600 dark:text-gray-400">
                          {c.phone || <span className="text-gray-400 dark:text-gray-500 italic">-</span>}
                        </td>
                        <td className="py-3 pr-4 text-gray-600 dark:text-gray-400 text-xs">
                          {c.firstJobDate ? formatDate(c.firstJobDate) : '-'}
                        </td>
                        <td className="py-3 pr-4 text-gray-600 dark:text-gray-400 text-xs">
                          {c.lastJobDate ? formatDate(c.lastJobDate) : '-'}
                        </td>
                        <td className="py-3 pr-4 text-right text-gray-600 dark:text-gray-400">
                          {c.totalJobs}
                        </td>
                        <td className="py-3 pr-4 text-right font-medium text-gray-900 dark:text-white">
                          ${c.totalRevenue.toLocaleString()}
                        </td>
                        <td className="py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => openEditCustomer(c)}
                              className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium transition-colors"
                            >
                              Edit
                            </button>
                            {deleteConfirmId === c.id ? (
                              <div className="flex gap-1">
                                <button
                                  onClick={() => handleDeleteCustomer(c.id)}
                                  className="text-xs text-red-600 dark:text-red-400 font-medium"
                                >
                                  Confirm
                                </button>
                                <button
                                  onClick={() => setDeleteConfirmId(null)}
                                  className="text-xs text-gray-500 dark:text-gray-400 font-medium"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setDeleteConfirmId(c.id)}
                                className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 font-medium transition-colors"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                page={customerPage}
                totalPages={customerTotalPages}
                onPageChange={setCustomerPage}
                total={sortedCustomers.length}
                pageSize={ITEMS_PER_PAGE}
              />
            </>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════ */}
      {/* TAB: REFERRALS                                        */}
      {/* ══════════════════════════════════════════════════════ */}
      {activeTab === 'referrals' && (
        <div>
          {/* Referral Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Referrals</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{totalReferrals}</p>
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Converted</p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">{convertedReferrals}</p>
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Conversion Rate</p>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{conversionRate}%</p>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Referrals ({totalReferrals})
              </h2>
              <button
                onClick={openCreateReferral}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Create Referral
              </button>
            </div>

            {referrals.length === 0 ? (
              <EmptyState
                icon="🤝"
                title="No Referrals Yet"
                description="Create your first referral by selecting a customer as the referrer."
                actionLabel="Create Referral"
                onAction={openCreateReferral}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                      <th className="pb-3 pr-4 font-medium">Referrer</th>
                      <th className="pb-3 pr-4 font-medium">Referred</th>
                      <th className="pb-3 pr-4 font-medium">Code</th>
                      <th className="pb-3 pr-4 font-medium">Status</th>
                      <th className="pb-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {referrals.map(ref => (
                      <tr
                        key={ref.id}
                        className="border-b border-gray-100 dark:border-gray-800 last:border-0"
                      >
                        <td className="py-3 pr-4 font-medium text-gray-900 dark:text-white">
                          {ref.referrerName}
                        </td>
                        <td className="py-3 pr-4">
                          <p className="text-gray-900 dark:text-white">{ref.referredName}</p>
                          {ref.referredEmail && (
                            <p className="text-xs text-gray-500 dark:text-gray-400">{ref.referredEmail}</p>
                          )}
                        </td>
                        <td className="py-3 pr-4">
                          <button
                            onClick={() => copyReferralCode(ref.referralCode)}
                            className="font-mono text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-2 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                            title="Click to copy"
                          >
                            {ref.referralCode}
                          </button>
                        </td>
                        <td className="py-3 pr-4">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${REFERRAL_STATUS_BADGE[ref.status] ?? ''}`}>
                            {ref.status}
                          </span>
                        </td>
                        <td className="py-3 text-right">
                          {ref.status !== 'converted' && ref.status !== 'expired' && (
                            <button
                              onClick={() => handleMarkConverted(ref)}
                              className="text-xs text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 font-medium transition-colors"
                            >
                              Mark Converted
                            </button>
                          )}
                          {ref.convertedAt && (
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {formatDate(ref.convertedAt)}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════ */}
      {/* TAB: REMINDERS                                        */}
      {/* ══════════════════════════════════════════════════════ */}
      {activeTab === 'reminders' && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Reminders ({reminders.length})
            </h2>
            <button
              onClick={openCreateReminder}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Create Reminder
            </button>
          </div>

          {reminders.length === 0 ? (
            <EmptyState
              icon="🔔"
              title="No Reminders Yet"
              description="Create reminders to reach out to customers for seasonal refreshes, maintenance, and follow-ups."
              actionLabel="Create Reminder"
              onAction={openCreateReminder}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                    <th className="pb-3 pr-4 font-medium">Customer</th>
                    <th className="pb-3 pr-4 font-medium">Type</th>
                    <th className="pb-3 pr-4 font-medium">Scheduled</th>
                    <th className="pb-3 pr-4 font-medium">Status</th>
                    <th className="pb-3 pr-4 font-medium">Message</th>
                    <th className="pb-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedReminders.map(rem => {
                    const overdue = isOverdue(rem.scheduledDate, rem.status);
                    return (
                      <tr
                        key={rem.id}
                        className={`border-b border-gray-100 dark:border-gray-800 last:border-0 ${
                          overdue ? 'bg-red-50 dark:bg-red-900/10' : ''
                        }`}
                      >
                        <td className="py-3 pr-4 font-medium text-gray-900 dark:text-white">
                          {rem.customerName}
                        </td>
                        <td className="py-3 pr-4">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${REMINDER_TYPE_BADGE[rem.reminderType] ?? ''}`}>
                            {REMINDER_TYPE_LABELS[rem.reminderType] ?? rem.reminderType}
                          </span>
                        </td>
                        <td className={`py-3 pr-4 text-xs ${overdue ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-gray-600 dark:text-gray-400'}`}>
                          {formatDate(rem.scheduledDate)}
                          {overdue && (
                            <span className="ml-1 text-red-600 dark:text-red-400">(overdue)</span>
                          )}
                        </td>
                        <td className="py-3 pr-4">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${REMINDER_STATUS_BADGE[rem.status] ?? ''}`}>
                            {rem.status}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-gray-600 dark:text-gray-400 max-w-[200px]">
                          <p className="truncate text-xs" title={rem.message}>
                            {rem.message}
                          </p>
                        </td>
                        <td className="py-3 text-right">
                          {rem.status === 'pending' && (
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => handleMarkSent(rem)}
                                className="text-xs text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 font-medium transition-colors"
                              >
                                Mark Sent
                              </button>
                              <button
                                onClick={() => handleCancelReminder(rem)}
                                className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 font-medium transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          )}
                          {rem.sentAt && (
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              Sent {formatDate(rem.sentAt)}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════ */}
      {/* MODAL: ADD/EDIT CUSTOMER                              */}
      {/* ══════════════════════════════════════════════════════ */}
      <Modal
        isOpen={showCustomerModal}
        onClose={() => setShowCustomerModal(false)}
        title={editingCustomer ? 'Edit Customer' : 'Add Customer'}
        size="lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={customerForm.name}
                onChange={e => setCustomerForm(prev => ({ ...prev, name: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Customer name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
              <input
                type="email"
                value={customerForm.email}
                onChange={e => setCustomerForm(prev => ({ ...prev, email: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="customer@email.com"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone</label>
              <input
                type="tel"
                value={customerForm.phone}
                onChange={e => setCustomerForm(prev => ({ ...prev, phone: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="555-123-4567"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Address</label>
              <input
                type="text"
                value={customerForm.address}
                onChange={e => setCustomerForm(prev => ({ ...prev, address: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="123 Main St"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">First Job Date</label>
              <input
                type="date"
                value={customerForm.firstJobDate}
                onChange={e => setCustomerForm(prev => ({ ...prev, firstJobDate: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Last Job Date</label>
              <input
                type="date"
                value={customerForm.lastJobDate}
                onChange={e => setCustomerForm(prev => ({ ...prev, lastJobDate: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Total Jobs</label>
              <input
                type="number"
                min="0"
                value={customerForm.totalJobs}
                onChange={e => setCustomerForm(prev => ({ ...prev, totalJobs: parseInt(e.target.value, 10) || 0 }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Total Revenue ($)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={customerForm.totalRevenue}
                onChange={e => setCustomerForm(prev => ({ ...prev, totalRevenue: parseFloat(e.target.value) || 0 }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
            <textarea
              value={customerForm.notes}
              onChange={e => setCustomerForm(prev => ({ ...prev, notes: e.target.value }))}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              placeholder="Additional notes..."
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => setShowCustomerModal(false)}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveCustomer}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              {editingCustomer ? 'Save Changes' : 'Add Customer'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ══════════════════════════════════════════════════════ */}
      {/* MODAL: CREATE REFERRAL                                */}
      {/* ══════════════════════════════════════════════════════ */}
      <Modal
        isOpen={showReferralModal}
        onClose={() => setShowReferralModal(false)}
        title="Create Referral"
        size="md"
      >
        <div className="space-y-4">
          {!generatedCode ? (
            <>
              {/* Step 1: Select referrer */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Referrer Customer <span className="text-red-500">*</span>
                </label>
                {customers.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    No customers yet. Add a customer first before creating a referral.
                  </p>
                ) : (
                  <select
                    value={referralForm.referrerCustomerId}
                    onChange={e => setReferralForm(prev => ({ ...prev, referrerCustomerId: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  >
                    <option value="">Select a customer...</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{c.name}{c.email ? ` (${c.email})` : ''}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Step 2: Referred person info */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Referred Person Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={referralForm.referredName}
                  onChange={e => setReferralForm(prev => ({ ...prev, referredName: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="John Doe"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                  <input
                    type="email"
                    value={referralForm.referredEmail}
                    onChange={e => setReferralForm(prev => ({ ...prev, referredEmail: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="john@email.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={referralForm.referredPhone}
                    onChange={e => setReferralForm(prev => ({ ...prev, referredPhone: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="555-123-4567"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setShowReferralModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateReferral}
                  disabled={customers.length === 0}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Generate Referral Code
                </button>
              </div>
            </>
          ) : (
            /* Step 3: Show generated code */
            <div className="text-center py-4">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">Referral code generated successfully!</p>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 p-6 mb-4">
                <p className="text-3xl font-mono font-bold text-gray-900 dark:text-white tracking-wider">
                  {generatedCode}
                </p>
              </div>
              <button
                onClick={() => copyReferralCode(generatedCode)}
                className={`px-6 py-2 text-sm font-medium rounded-lg transition-colors ${
                  codeCopied
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {codeCopied ? 'Copied!' : 'Copy Code'}
              </button>
              <div className="mt-4">
                <button
                  onClick={() => setShowReferralModal(false)}
                  className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* ══════════════════════════════════════════════════════ */}
      {/* MODAL: CREATE REMINDER                                */}
      {/* ══════════════════════════════════════════════════════ */}
      <Modal
        isOpen={showReminderModal}
        onClose={() => setShowReminderModal(false)}
        title="Create Reminder"
        size="lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Customer <span className="text-red-500">*</span>
              </label>
              {customers.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  No customers yet. Add a customer first.
                </p>
              ) : (
                <select
                  value={reminderForm.customerId}
                  onChange={e => handleReminderCustomerChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                >
                  <option value="">Select a customer...</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Reminder Type <span className="text-red-500">*</span>
              </label>
              <select
                value={reminderForm.reminderType}
                onChange={e => handleReminderTypeChange(e.target.value as ReminderType)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
              >
                <option value="seasonal_refresh">Seasonal Refresh</option>
                <option value="maintenance">Maintenance</option>
                <option value="followup">Follow-up</option>
                <option value="anniversary">Anniversary</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Scheduled Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={reminderForm.scheduledDate}
              onChange={e => setReminderForm(prev => ({ ...prev, scheduledDate: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Message</label>
            <textarea
              value={reminderForm.message}
              onChange={e => setReminderForm(prev => ({ ...prev, message: e.target.value }))}
              rows={6}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              placeholder="Reminder message..."
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Message is pre-filled from the template. You can edit it before saving.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => setShowReminderModal(false)}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateReminder}
              disabled={customers.length === 0}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create Reminder
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
