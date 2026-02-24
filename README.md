# LeadGen - Cold Email Outreach & Lead Management Platform

A full-stack lead generation and cold email system built with Next.js 16, React 19, MongoDB, and Tailwind CSS. Installable as a PWA on any device.

## What It Does

LeadGen automates the entire cold email outreach workflow: find businesses, score them, generate personalized emails, send via multi-account SMTP rotation, track opens/clicks/replies, and auto-follow-up when leads don't respond.

---

## Features

### Lead Management
- **Add leads manually** or **bulk import via CSV**
- **Google Places API search** to discover businesses (results cached 7 days)
- **Auto-calculated lead score** (0-100) based on website quality, social presence, reviews, and digital gaps
- **Lead detail pages** with full contact info, activity timeline, email stats
- **Pipeline board** with drag-and-drop Kanban (Prospect > Outreach > Engaged > Meeting > Proposal > Won/Lost)
- **6 lead statuses**: New, Contacted, Responded, Qualified, Closed, Rejected
- **CSV export** of filtered leads
- **Duplicate detection** on import

### Email Generation & Sending
- **Template-based email generation** with 3 variations per lead (Short, Medium, Detailed)
- **5 built-in templates** targeting: No Website, Bad Website, No Social Media, Low Reviews, General
- **Custom templates** with variable substitution: `{business_name}`, `{contact_name}`, `{first_name}`, `{industry}`, `{location}`, `{your_name}`, `{service_offering}`, `{value_prop}`
- **Multi-provider SMTP** support: Gmail, Zoho, Outlook, Custom SMTP
- **Account rotation**: round-robin across active SMTP accounts respecting per-account daily limits
- **Email warmup**: gradual daily limit increase (5 > 10 > full) to build sender reputation
- **A/B testing**: alternates variations across campaign sends, tracks winner by open/click/reply rates
- **Schedule sends** for future delivery
- **Copy to clipboard**, **Open in Gmail**, **Open in Mail client** options
- **CAN-SPAM compliant**: auto-appends unsubscribe link + business address footer

### Email Tracking
- **Open tracking** via invisible 1x1 pixel
- **Click tracking** via redirect URLs
- **Bounce detection** (SMTP 550-554 error codes)
- **Unsubscribe handling**: one-click unsubscribe link, blocks future sends
- All tracking is per-email with unique tracking IDs

### Campaigns
- **Bulk email campaigns** targeting multiple leads
- **Per-lead status tracking**: Drafted > Sent > Opened > Clicked > Responded > Bounced
- **Progress bar** showing campaign completion
- **Send All Unsent** with 3-second delays between sends
- **A/B test group assignment** (alternating variations)
- **Daily limit enforcement** with warmup awareness

### Follow-Up Sequences
- **Automated follow-up engine** with configurable steps
- **Conditions**: Send only if no reply, no open, or always
- **Delay-based triggers**: e.g., Step 1 after 5 days, Step 2 after 7 days, Step 3 after 14 days
- **Variable substitution** in follow-up emails
- **2 default sequences** included: "Standard 3-Step" and "Quick 2-Step Nudge"
- **One active sequence** at a time (toggle on/off)

### IMAP Reply Detection
- **Auto-polls IMAP inboxes** every 5 minutes for new replies
- **Reply classification** using keyword matching: Interested, Not Interested, Out of Office, Unsubscribe, Auto Reply
- **Auto-updates lead status**: "interested" replies set lead to Responded, "unsubscribe" replies block future sends
- **Inbox tab** shows detected replies with category badges
- **Notification bell** alerts on new replies

### Analytics Dashboard
- **Key metrics**: Total Leads, Contacted, Responses, Closed, Average Score
- **Daily send progress** bar (today's sends vs. limit)
- **30-day trend chart**: emails sent vs. responses over time
- **Lead status distribution** pie chart
- **Industry breakdown** bar chart (top 8)
- **Conversion funnel**: Total > Contacted > Responded > Qualified > Closed
- **A/B test results** table with open/click/reply rates per group
- **Best send times** analysis (5 time slots with highest open rates)
- **Suggested actions** with priority levels
- **Recent activity** feed

### Notifications
- **In-app notification bell** with unread count badge
- **Notification types**: Reply Received, Send Failed, Warmup Milestone, Daily Limit Reached, Bounce Detected
- **Mark as read** / **Mark all read**
- **Click notification** to navigate to relevant page

### Security
- **JWT session authentication** (optional, configurable via AUTH_PASSWORD)
- **API secret header** protection on `/api/db` routes
- **AES-256-GCM encryption** for stored SMTP passwords
- **Input validation** on API routes (Zod schemas)
- **Unsubscribe check** before every send (both immediate and scheduled)

### PWA & Mobile
- **Installable PWA** with manifest, service worker, and offline fallback
- **Mobile-first responsive design** across all pages
- **Safe area insets** for notch phones in standalone mode
- **Touch-friendly** tap targets (44px minimum on touch devices)
- **No iOS zoom** on input focus (16px base font)
- **App shortcuts**: Search, Leads, Campaigns, Inbox
- **Dark mode** toggle (persists in localStorage)

---

## System Architecture

```
Browser (React 19 + Tailwind CSS v4)
  |
  +-- Client DB proxy (src/lib/db.ts)
  |     |
  |     +-- POST /api/db (switch-based dispatcher)
  |           |
  |           +-- Server DB layer (src/lib/db-server.ts)
  |                 |
  |                 +-- MongoDB (Atlas or local)
  |
  +-- API Routes
  |     +-- /api/send-email       (nodemailer + multi-SMTP)
  |     +-- /api/search-businesses (Google Places + cache)
  |     +-- /api/analyze-website   (HTML quality analysis)
  |     +-- /api/verify-email      (MX + syntax check)
  |     +-- /api/check-deliverability (SPF/DKIM/DMARC)
  |     +-- /api/smtp-accounts     (CRUD + test connection)
  |     +-- /api/auth              (login/logout/check)
  |     +-- /api/track/open        (pixel tracking)
  |     +-- /api/track/click       (link redirect tracking)
  |     +-- /api/unsubscribe       (one-click unsubscribe)
  |
  +-- Background Jobs (via instrumentation.ts)
        +-- Scheduled email sender    (every 60s)
        +-- Follow-up sequence engine (every 5min)
        +-- IMAP reply poller         (every 5min)
        +-- Warmup day counter        (every hour)
        +-- SMTP daily count reset    (every hour)
```

---

## Data Models

| Model | Purpose |
|-------|---------|
| **Lead** | Business contact with score, status, pipeline stage, tags, social media |
| **Email** | Sent/drafted email with tracking IDs, A/B group, open/click/response timestamps |
| **Campaign** | Bulk email campaign with per-lead status tracking |
| **EmailTemplate** | Reusable email template with variable placeholders and multiple subject lines |
| **FollowUpSequence** | Multi-step automated follow-up with delay and condition per step |
| **ScheduledEmail** | Queued email pending delivery by background job |
| **SmtpAccount** | SMTP/IMAP account config with encrypted password and daily limit |
| **InboxReply** | IMAP-detected reply with auto-classification and lead matching |
| **UnsubscribeRecord** | Email addresses that opted out |
| **SendLog** | Daily send count for limit enforcement |
| **AppNotification** | In-app notification (reply received, bounce, limit reached, etc.) |
| **UserSettings** | Profile, SMTP config, warmup, daily limits, API keys |

---

## Lead Scoring Algorithm

Leads are scored 0-100 based on digital gaps (higher = more opportunity):

| Signal | Points |
|--------|--------|
| No website | +50 |
| Bad website | +30 |
| Not mobile friendly | +15 |
| Slow loading | +10 |
| Outdated design | +10 |
| No social media | +25 |
| Only 1 social platform | +15 |
| Low reviews | +20 |
| No online ordering | +15 |
| No booking system | +15 |
| Poor SEO | +10 |
| Has email (contactable) | +5 |

**Score labels**: 80+ = Hot Lead, 60-79 = Warm Lead, 40-59 = Cool Lead, <40 = Cold Lead

---

## User Flows

### 1. Setup
Login > Onboarding Wizard (4 steps: Welcome, Profile, Business Info, API Keys) > Dashboard

### 2. Find Leads
Search page > Enter business type + location > Google Places returns results > Add to leads > Auto-scored

### 3. Generate & Send Email
Emails page > Select lead > Generate 3 variations > Edit subject/body > Send (immediate or scheduled)

### 4. Run a Campaign
Campaigns > New Campaign > Select leads > View campaign > Send All Unsent > Track per-lead status

### 5. Auto Follow-Up
Sequences > Create/activate sequence > Background job checks every 5min > Schedules follow-ups for non-responsive leads

### 6. Track Engagement
Inbox > Filter by Opened/Clicked/Responded/Bounced > View details > Classify replies

### 7. IMAP Reply Detection
Settings > Add SMTP account with IMAP > Enable polling > Replies auto-detected > Lead status auto-updated > Notification sent

### 8. Pipeline Management
Pipeline > Drag leads between stages (Prospect > Outreach > Engaged > Meeting > Proposal > Won/Lost)

---

## Pages

| Page | Route | Description |
|------|-------|-------------|
| Dashboard | `/` | Metrics, charts, funnel, A/B results, suggested actions |
| Search | `/search` | Google Places business search with caching |
| Leads | `/leads` | Lead table with search, filter, sort, import/export |
| Lead Detail | `/leads/[id]` | Full lead profile with timeline and stats |
| Emails | `/emails` | Email generator with 3 variations, send/schedule |
| Inbox | `/inbox` | Email tracking dashboard with engagement filters |
| Campaigns | `/campaigns` | Bulk email campaigns with per-lead status |
| Templates | `/templates` | Email template manager (built-in + custom) |
| Pipeline | `/pipeline` | Kanban board for deal stages |
| Sequences | `/sequences` | Follow-up sequence builder and manager |
| Scheduled | `/scheduled` | Scheduled email queue with status |
| Assistant | `/assistant` | Smart outreach advisor |
| Settings | `/settings` | Profile, SMTP accounts, warmup, data management |
| Login | `/login` | Password authentication |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16.1.6 (App Router, Turbopack) |
| Frontend | React 19, Tailwind CSS v4 |
| Database | MongoDB (Atlas free tier or local) |
| Email | Nodemailer (multi-provider SMTP) |
| IMAP | imapflow (reply detection) |
| Auth | jose (JWT), Node.js crypto (PBKDF2) |
| Encryption | AES-256-GCM (Node.js crypto) |
| Charts | Recharts |
| Drag & Drop | @hello-pangea/dnd |
| Validation | Zod |
| CSV | PapaParse |

---

## Getting Started

### Prerequisites
- Node.js 18+
- MongoDB (Atlas free tier or local instance)

### Install & Run

```bash
git clone https://github.com/bougzy/leadgen.git
cd leadgen
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment Variables (Optional)

The app works out of the box with hardcoded defaults. To override, create a `.env.local`:

```env
MONGODB_URI=mongodb+srv://...
API_SECRET=your-64-char-hex
NEXT_PUBLIC_API_SECRET=same-as-above
ENCRYPTION_KEY=your-64-char-hex
NEXT_PUBLIC_BASE_URL=https://yourdomain.com
BASE_URL=https://yourdomain.com
AUTH_PASSWORD=your-password
```

### Deploy to Vercel

```bash
npm run build
```

Push to GitHub and connect to Vercel. **No environment variables needed** - all defaults are built into the code.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth` | Login with password |
| GET | `/api/auth` | Check auth status |
| DELETE | `/api/auth` | Logout |
| POST | `/api/db` | Database operations (40+ actions) |
| POST | `/api/send-email` | Send email via SMTP |
| POST | `/api/search-businesses` | Google Places search |
| POST | `/api/analyze-website` | Website quality analysis |
| POST | `/api/verify-email` | Email deliverability check |
| POST | `/api/check-deliverability` | SPF/DKIM/DMARC check |
| POST | `/api/smtp-accounts` | SMTP account management |
| GET | `/api/track/open` | Open tracking pixel |
| GET | `/api/track/click` | Click tracking redirect |
| POST | `/api/track/events` | Custom event tracking |
| GET | `/api/unsubscribe` | Email unsubscribe handler |

---

## Background Jobs

| Job | Interval | Purpose |
|-----|----------|---------|
| Scheduled Email Sender | 60 seconds | Sends pending scheduled emails via SMTP rotation |
| Follow-Up Engine | 5 minutes | Queues follow-ups for non-responsive leads |
| IMAP Reply Poller | 5 minutes | Detects and classifies incoming replies |
| Warmup Counter | 1 hour | Increments warmup day count at midnight |
| SMTP Count Reset | 1 hour | Resets daily send counts at midnight |

---

## License

MIT
