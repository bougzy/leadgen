'use client';

import { useState, useEffect, useCallback } from 'react';
import type { UserSettings } from '@/types';

interface OnboardingWizardProps {
  settings: UserSettings;
  onComplete: (updatedSettings: UserSettings) => void;
}

const TOTAL_STEPS = 4;

export default function OnboardingWizard({ settings, onComplete }: OnboardingWizardProps) {
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward');
  const [animating, setAnimating] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    name: settings.name || '',
    email: settings.email || '',
    phone: settings.phone || '',
    businessAddress: settings.businessAddress || '',
    serviceOffering: settings.serviceOffering || 'Website development and digital marketing',
    valueProp: settings.valueProp || 'I help local businesses get more customers through modern websites and online presence.',
    targetLocation: settings.targetLocation || '',
    googleApiKey: settings.googleApiKey || '',
    smtpEmail: settings.smtpEmail || '',
    smtpPassword: settings.smtpPassword || '',
  });

  const updateField = useCallback((field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  }, [errors]);

  function goTo(nextStep: number) {
    if (animating) return;
    setDirection(nextStep > step ? 'forward' : 'backward');
    setAnimating(true);
    setTimeout(() => {
      setStep(nextStep);
      setAnimating(false);
    }, 200);
  }

  function validateProfile(): boolean {
    const newErrors: Record<string, string> = {};
    if (!form.name.trim()) newErrors.name = 'Name is required';
    if (!form.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      newErrors.email = 'Please enter a valid email';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function handleNext() {
    if (step === 1 && !validateProfile()) return;
    goTo(step + 1);
  }

  function handleBack() {
    goTo(step - 1);
  }

  function handleComplete() {
    const updatedSettings: UserSettings = {
      ...settings,
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      businessAddress: form.businessAddress.trim(),
      serviceOffering: form.serviceOffering.trim(),
      valueProp: form.valueProp.trim(),
      targetLocation: form.targetLocation.trim(),
      googleApiKey: form.googleApiKey.trim(),
      smtpEmail: form.smtpEmail.trim(),
      smtpPassword: form.smtpPassword.trim(),
      onboardingComplete: true,
    };
    onComplete(updatedSettings);
  }

  // Keyboard shortcut: Enter to proceed
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Enter' && !e.shiftKey) {
        if (step === 0) handleNext();
        else if (step === 3) handleComplete();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const progressPercent = ((step + 1) / TOTAL_STEPS) * 100;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        className="relative w-full max-w-xl mx-4 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden"
      >
        {/* Progress bar */}
        <div className="h-1 bg-gray-100 dark:bg-gray-800">
          <div
            className="h-full bg-blue-600 transition-all duration-500 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Step indicator dots */}
        <div className="flex items-center justify-center gap-2 pt-6 pb-2">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div
              key={i}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === step
                  ? 'w-6 bg-blue-600'
                  : i < step
                  ? 'w-2 bg-blue-400'
                  : 'w-2 bg-gray-300 dark:bg-gray-700'
              }`}
            />
          ))}
        </div>

        {/* Content area */}
        <div className="px-8 pb-8 pt-4 min-h-[420px] flex flex-col">
          <div
            className={`flex-1 transition-all duration-200 ease-out ${
              animating
                ? direction === 'forward'
                  ? 'opacity-0 translate-x-4'
                  : 'opacity-0 -translate-x-4'
                : 'opacity-100 translate-x-0'
            }`}
          >
            {step === 0 && <StepWelcome onNext={handleNext} />}
            {step === 1 && (
              <StepProfile
                form={form}
                errors={errors}
                updateField={updateField}
                onNext={handleNext}
                onBack={handleBack}
              />
            )}
            {step === 2 && (
              <StepApiSetup
                form={form}
                updateField={updateField}
                onNext={handleNext}
                onBack={handleBack}
                onSkip={() => goTo(3)}
              />
            )}
            {step === 3 && (
              <StepReady
                onComplete={handleComplete}
                onBack={handleBack}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Step Components
   ============================================================ */

function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center text-center h-full py-8">
      <div className="text-6xl mb-6">🚀</div>
      <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">
        Welcome to LeadGen!
      </h2>
      <p className="text-gray-600 dark:text-gray-400 text-lg max-w-md mb-8 leading-relaxed">
        Let&apos;s get you set up in 3 minutes. We&apos;ll configure your profile, API keys, and
        you&apos;ll be ready to find leads.
      </p>
      <button
        onClick={onNext}
        className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all text-lg"
      >
        Get Started
      </button>
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-4">
        Press Enter to continue
      </p>
    </div>
  );
}

function StepProfile({
  form,
  errors,
  updateField,
  onNext,
  onBack,
}: {
  form: Record<string, string>;
  errors: Record<string, string>;
  updateField: (field: string, value: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
        Your Profile
      </h2>
      <p className="text-gray-500 dark:text-gray-400 text-sm mb-5">
        Tell us about yourself and your business.
      </p>

      <div className="space-y-4 flex-1 overflow-y-auto pr-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InputField
            label="Name"
            required
            value={form.name}
            error={errors.name}
            onChange={v => updateField('name', v)}
            placeholder="John Smith"
          />
          <InputField
            label="Email"
            type="email"
            required
            value={form.email}
            error={errors.email}
            onChange={v => updateField('email', v)}
            placeholder="john@example.com"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InputField
            label="Phone"
            value={form.phone}
            onChange={v => updateField('phone', v)}
            placeholder="(555) 123-4567"
          />
          <InputField
            label="Business Address"
            value={form.businessAddress}
            onChange={v => updateField('businessAddress', v)}
            placeholder="123 Main St, City, State"
          />
        </div>
        <InputField
          label="Service Offering"
          value={form.serviceOffering}
          onChange={v => updateField('serviceOffering', v)}
          placeholder="Website development and digital marketing"
        />
        <InputField
          label="Value Proposition"
          value={form.valueProp}
          onChange={v => updateField('valueProp', v)}
          placeholder="I help local businesses get more customers..."
        />
        <InputField
          label="Target Location"
          value={form.targetLocation}
          onChange={v => updateField('targetLocation', v)}
          placeholder="e.g., Austin, TX"
        />
      </div>

      <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-100 dark:border-gray-800">
        <button
          onClick={onBack}
          className="px-5 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          Back
        </button>
        <button
          onClick={onNext}
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow hover:shadow-lg transition-all text-sm"
        >
          Next
        </button>
      </div>
    </div>
  );
}

function StepApiSetup({
  form,
  updateField,
  onNext,
  onBack,
  onSkip,
}: {
  form: Record<string, string>;
  updateField: (field: string, value: string) => void;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
        API Setup
      </h2>
      <p className="text-gray-500 dark:text-gray-400 text-sm mb-5">
        Connect your services. You can always update these later in Settings.
      </p>

      <div className="space-y-6 flex-1">
        {/* Google Places */}
        <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">🗺️</span>
            <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Google Places API</h3>
          </div>
          <InputField
            label="API Key"
            value={form.googleApiKey}
            onChange={v => updateField('googleApiKey', v)}
            placeholder="AIzaSy..."
            mono
          />
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
            Used to search for local businesses. Get a key from the{' '}
            <span className="text-blue-500">Google Cloud Console</span>.
          </p>
        </div>

        {/* Email SMTP */}
        <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">📧</span>
            <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Email Account (Gmail, Zoho, Outlook)</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <InputField
              label="Email Address"
              type="email"
              value={form.smtpEmail}
              onChange={v => updateField('smtpEmail', v)}
              placeholder="you@gmail.com or you@zoho.com"
            />
            <InputField
              label="App Password"
              type="password"
              value={form.smtpPassword}
              onChange={v => updateField('smtpPassword', v)}
              placeholder="xxxx xxxx xxxx xxxx"
              mono
            />
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
            Use an App Password from your email provider. You can add more accounts in Settings later.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-100 dark:border-gray-800">
        <button
          onClick={onBack}
          className="px-5 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          Back
        </button>
        <div className="flex items-center gap-3">
          <button
            onClick={onSkip}
            className="px-5 py-2.5 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 border border-gray-300 dark:border-gray-600 rounded-xl hover:border-gray-400 dark:hover:border-gray-500 transition-all"
          >
            Skip for now
          </button>
          <button
            onClick={onNext}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow hover:shadow-lg transition-all text-sm"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

function StepReady({
  onComplete,
  onBack,
}: {
  onComplete: () => void;
  onBack: () => void;
}) {
  const features = [
    { icon: '🔍', title: 'Search for businesses', desc: 'Find local businesses using Google Places' },
    { icon: '✉️', title: 'Generate emails', desc: 'Template-based personalized outreach' },
    { icon: '📨', title: 'Send directly', desc: 'Send emails right from the app' },
  ];

  return (
    <div className="flex flex-col items-center justify-center text-center h-full py-4">
      <div className="text-6xl mb-4">🚀</div>
      <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
        You&apos;re all set!
      </h2>
      <p className="text-gray-500 dark:text-gray-400 mb-8">
        Here&apos;s what you can do now:
      </p>

      <div className="w-full max-w-sm space-y-3 mb-8">
        {features.map((f, i) => (
          <div
            key={i}
            className="flex items-center gap-4 p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 text-left"
          >
            <span className="text-2xl">{f.icon}</span>
            <div>
              <p className="font-semibold text-gray-900 dark:text-white text-sm">{f.title}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{f.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={onComplete}
        className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all text-lg"
      >
        Go to Dashboard
      </button>

      <button
        onClick={onBack}
        className="mt-3 text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
      >
        Go back
      </button>
    </div>
  );
}

/* ============================================================
   Shared InputField Component
   ============================================================ */

function InputField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  required,
  error,
  mono,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  error?: string;
  mono?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors ${
          error
            ? 'border-red-400 dark:border-red-500'
            : 'border-gray-300 dark:border-gray-600'
        } ${mono ? 'font-mono text-xs' : ''}`}
      />
      {error && (
        <p className="text-xs text-red-500 mt-1">{error}</p>
      )}
    </div>
  );
}
