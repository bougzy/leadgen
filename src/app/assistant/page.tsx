'use client';

import { useEffect, useState, useRef } from 'react';
import { getAllAccounts, getAllEmails, getAllCampaigns, getSettings } from '@/lib/db';
import { getSuggestions, getStats } from '@/lib/suggestions';
import type { Account, Email, Campaign, UserSettings, ChatMessage } from '@/types';
import { generateId } from '@/lib/utils';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

const INDUSTRY_TIPS: Record<string, string> = {
  restaurant: `**Restaurant Account Strategy:**\n- Lead with "97% of diners check websites before visiting"\n- Focus on online ordering — most restaurants lose revenue without it\n- Mention Instagram specifically — food photos drive 40% more foot traffic\n- Google Business Profile optimization is huge for local search\n- Reviews are critical — help them get to 50+ reviews\n- Best time to email: Tuesday-Thursday, 10am-2pm`,
  gym: `**Gym/Fitness Account Strategy:**\n- 81% of gym members start their search online\n- Focus on online booking and class schedules\n- Social proof is massive — showcase transformations\n- Instagram and TikTok are key platforms for fitness\n- Seasonal timing: January (New Year), May (summer bodies)\n- Offer a free website audit as your lead magnet`,
  salon: `**Salon/Spa Account Strategy:**\n- 82% of salon clients book appointments online\n- A booking system is the #1 pain point\n- Instagram portfolio is essential for stylists\n- Before/after photos drive engagement\n- Google reviews directly impact new client acquisition\n- Focus on mobile experience — most searches are on phone`,
  dental: `**Dental Practice Account Strategy:**\n- 70%+ of patients choose dentists based on online presence\n- Focus on trust signals: reviews, certifications, team photos\n- Online appointment booking reduces no-shows by 30%\n- Emphasize patient education content\n- Google Maps ranking is crucial for local dental search`,
  'auto repair': `**Auto Repair Account Strategy:**\n- 83% search "auto repair near me" on mobile during emergencies\n- Speed of website loading is critical — every second counts\n- Online scheduling for non-emergency services\n- Focus on trust: certifications, warranties, reviews\n- Google Maps with accurate hours is essential`,
};

const DEFAULT_TIP = `**General Account Strategy:**\n- Focus on the specific pain point you identified\n- Lead with value, not your credentials\n- Keep emails under 150 words\n- Include one clear call-to-action\n- Follow up within 5 days if no response\n- Personalize every email to the specific business`;

function getAssistantResponse(message: string, accounts: Account[], emails: Email[], campaigns: Campaign[], settings: UserSettings): string {
  const msg = message.toLowerCase();
  const stats = getStats(accounts, emails);
  const suggestions = getSuggestions(accounts, campaigns, emails, settings.followUpDays);

  for (const [industry, tips] of Object.entries(INDUSTRY_TIPS)) {
    if (msg.includes(industry)) return tips;
  }
  if (msg.includes('approach') || msg.includes('strategy') || msg.includes('how should i')) return DEFAULT_TIP;

  if (msg.includes('what should i do') || msg.includes('next') || msg.includes('suggest')) {
    if (suggestions.length === 0) return `You're all caught up! Here are some ideas:\n- Add more accounts to your pipeline\n- Review and update your email templates\n- Check your settings to make sure your value proposition is compelling`;
    let response = `**Here's what I recommend:**\n\n`;
    suggestions.forEach((s, i) => { response += `${i + 1}. ${s.icon} **${s.text}** (${s.priority} priority)\n`; });
    return response;
  }

  if (msg.includes('response rate') || (msg.includes('why') && (msg.includes('low') || msg.includes('not responding')))) {
    if (stats.emailsSent === 0) return `You haven't sent any emails yet! Start by:\n1. Going to your Accounts page\n2. Selecting high-score accounts\n3. Generating personalized emails\n4. Sending them through Gmail\n\nAim for 10-20 emails per day to start.`;
    let response = `**Your Response Rate: ${stats.responseRate}%** (${stats.emailsResponded}/${stats.emailsSent} emails)\n\n`;
    if (stats.responseRate < 5) response += `This is below average. Here's how to improve:\n- **Shorten your emails** — aim for under 100 words\n- **Improve subject lines** — make them personal and curiosity-driven\n- **Lead with their problem**, not your solution\n- **Send at optimal times** — Tuesday-Thursday, 9am-11am\n- **Follow up!** — 80% of sales happen after the 5th contact`;
    else if (stats.responseRate < 15) response += `Not bad! Here's how to improve further:\n- A/B test different subject lines\n- Try shorter vs longer emails\n- Experiment with different CTAs\n- Segment by industry for more personalization`;
    else response += `Great job! Your response rate is above average.\n\nKeep personalizing every email and follow up promptly.`;
    return response;
  }

  if (msg.includes('review') || msg.includes('improve') || msg.includes('email')) {
    return `**Email Best Practices Checklist:**\n\n✅ **Subject Line** — Under 50 chars, personal, creates curiosity\n✅ **Email Body** — Under 150 words, starts with their problem\n✅ **Personalization** — Mention their business name and location\n✅ **CTA** — One clear call-to-action (call, reply, or meeting)\n✅ **Timing** — Tuesday-Thursday, 9am-11am or 1pm-3pm\n✅ **Follow up** — After 5 days if no response\n\n**Pro tip:** The best cold emails feel like a friend giving advice, not a salesperson pitching.`;
  }

  if (msg.includes('stats') || msg.includes('overview') || msg.includes('how am i doing') || msg.includes('performance')) {
    return `**Your Dashboard:**\n\n- Total Accounts: **${stats.total}**\n- Prospect: ${stats.byStage.prospect} | Contacted: ${stats.byStage.contacted} | Engaged: ${stats.byStage.engaged}\n- Qualified: ${stats.byStage.qualified} | Won: ${stats.byStage.won}\n- Emails Sent: **${stats.emailsSent}**\n- Response Rate: **${stats.responseRate}%**\n- Average Account Score: **${stats.avgScore}**`;
  }

  if (msg.includes('help') || msg.includes('how do i') || msg.includes('getting started')) {
    return `**Getting Started Guide:**\n\n1. **Add Accounts** → Go to Accounts page, add manually or import CSV\n2. **Review Scores** → Higher scores = better opportunities\n3. **Generate Emails** → Select an account, click Generate Email\n4. **Send Manually** → Copy email, open Gmail, paste and send\n5. **Track Status** → Mark emails as sent, track responses\n6. **Create Campaigns** → Group accounts for organized outreach\n7. **Follow Up** → Check suggestions for follow-up reminders`;
  }

  return `I can help you with:\n\n- **"How should I approach [industry] accounts?"** — Industry-specific tips\n- **"What should I do next?"** — Personalized suggestions\n- **"Why is my response rate low?"** — Improvement tips\n- **"Review my email approach"** — Best practices checklist\n- **"How am I doing?"** — Stats overview\n- **"Help"** — Getting started guide\n\nTry asking one of these questions!`;
}

export default function AssistantPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [emails, setEmails] = useState<Email[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function load() {
      try {
        const [l, e, c, s] = await Promise.all([getAllAccounts(), getAllEmails(), getAllCampaigns(), getSettings()]);
        setAccounts(l); setEmails(e); setCampaigns(c); setSettings(s);
      } catch (err) { console.error('Failed to load data:', err); }
      finally { setLoading(false); }
    }
    load();
  }, []);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  function handleSend() {
    if (!input.trim() || !settings) return;
    const userMsg: ChatMessage = { id: generateId(), role: 'user', content: input.trim(), timestamp: new Date().toISOString() };
    const response = getAssistantResponse(input, accounts, emails, campaigns, settings);
    const assistantMsg: ChatMessage = { id: generateId(), role: 'assistant', content: response, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setInput('');
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  if (loading) return <LoadingSpinner />;

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <div className="mb-4">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Assistant</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">Your smart outreach advisor</p>
      </div>

      <div className="flex-1 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center py-12">
              <span className="text-4xl mb-4">🤖</span>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">How can I help?</h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm max-w-md mb-6">Ask me about outreach strategy, email best practices, or what to do next.</p>
              <div className="flex flex-wrap justify-center gap-2">
                {['What should I do next?', 'How to approach restaurants?', 'Review my email approach', 'How am I doing?'].map(q => (
                  <button key={q} onClick={() => setInput(q)} className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg text-xs hover:bg-gray-200 dark:hover:bg-gray-700">{q}</button>
                ))}
              </div>
            </div>
          )}
          {messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] px-4 py-3 rounded-xl text-sm ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white'}`}>
                <div className="whitespace-pre-wrap leading-relaxed">
                  {msg.content.split(/(\*\*.*?\*\*)/).map((part, i) =>
                    part.startsWith('**') && part.endsWith('**')
                      ? <strong key={i}>{part.slice(2, -2)}</strong>
                      : <span key={i}>{part}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
        <div className="border-t border-gray-200 dark:border-gray-800 p-4">
          <div className="flex gap-2">
            <input type="text" value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
              placeholder="Ask me anything about your outreach..."
              className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            <button onClick={handleSend} disabled={!input.trim()} className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed">Send</button>
          </div>
        </div>
      </div>
    </div>
  );
}
