import type { GbpPostTemplate, SocialContentTemplate } from '@/types';

export const BUILT_IN_GBP_POST_TEMPLATES: Omit<GbpPostTemplate, 'id' | 'createdAt'>[] = [
  {
    name: 'Spring Cleaning Special',
    category: 'seasonal',
    title: 'Spring Special at {business_name}!',
    body: 'Spring is here! Time for a fresh start. {business_name} is offering special spring rates on {service} for homes in {neighborhood}. Book now and enjoy a cleaner, fresher space this season.\n\nCall us today or book online!',
    callToAction: 'Book Now',
    isBuiltIn: true,
  },
  {
    name: 'Summer Promotion',
    category: 'seasonal',
    title: 'Beat the Heat with {business_name}',
    body: 'Summer is here and {business_name} has you covered! Take advantage of our summer specials on {service}. Serving {neighborhood} and surrounding areas.\n\nLimited time offer — don\'t miss out!',
    callToAction: 'Learn More',
    isBuiltIn: true,
  },
  {
    name: 'Before & After Showcase',
    category: 'before_after',
    title: 'Amazing Transformation by {business_name}',
    body: 'Check out this incredible before & after! Our team at {business_name} transformed this space with professional {service}.\n\nWant results like these? We serve {neighborhood} and all surrounding areas. Contact us for a free estimate!',
    callToAction: 'Get Quote',
    isBuiltIn: true,
  },
  {
    name: 'Service Spotlight',
    category: 'service_spotlight',
    title: '{service} by {business_name}',
    body: 'Did you know {business_name} offers professional {service}? Our experienced team uses top-of-the-line equipment to deliver outstanding results every time.\n\nServing {neighborhood} and beyond. Call us today!',
    callToAction: 'Call Now',
    isBuiltIn: true,
  },
  {
    name: 'Pro Tips',
    category: 'tips',
    title: 'Pro Tips from {business_name}',
    body: 'Here\'s a quick tip from the pros at {business_name}:\n\n{tip_content}\n\nFor professional help, contact us anytime. We proudly serve {neighborhood} and surrounding communities.',
    isBuiltIn: true,
  },
  {
    name: 'Holiday Hours',
    category: 'holiday',
    title: 'Holiday Hours at {business_name}',
    body: '{business_name} will have adjusted hours during the holiday season. We\'re still here to serve {neighborhood}!\n\nContact us to schedule your {service} before the holidays.',
    callToAction: 'Book Now',
    isBuiltIn: true,
  },
  {
    name: 'Customer Testimonial',
    category: 'testimonial',
    title: 'What Our Customers Say',
    body: '"{review_quote}"\n\n— {customer_name}, {neighborhood}\n\nThank you for trusting {business_name}! We love serving our community. Ready for the same great experience? Contact us today!',
    callToAction: 'Learn More',
    isBuiltIn: true,
  },
];

export const BUILT_IN_SOCIAL_TEMPLATES: Omit<SocialContentTemplate, 'id' | 'createdAt'>[] = [
  {
    name: 'Instagram Before/After',
    platform: 'instagram',
    category: 'before_after',
    title: 'Before & After',
    body: 'What a transformation! Swipe to see the before & after of our latest {service} job in {neighborhood}. \n\nOur team at {business_name} takes pride in every project. Want results like these?\n\nDM us or call for a free estimate!',
    hashtags: ['#beforeandafter', '#transformation', '#satisfying'],
    isBuiltIn: true,
  },
  {
    name: 'Facebook Neighborhood Post',
    platform: 'facebook',
    category: 'neighborhood',
    title: 'Serving {neighborhood}!',
    body: 'Hey {neighborhood} neighbors! {business_name} here.\n\nWe\'re proud to serve this amazing community with professional {service}. Whether you need a quick job or a full project, we\'ve got you covered.\n\nMention this post for 10% off your first booking! Call us at {phone} or visit our website.',
    hashtags: ['#local', '#community'],
    isBuiltIn: true,
  },
  {
    name: 'Nextdoor Recommendation',
    platform: 'nextdoor',
    category: 'recommendation',
    title: 'Recommend {business_name}',
    body: 'Hi neighbors! I just had {business_name} do {service} at my place and they did an amazing job. Professional, on time, and great results. Highly recommend them if you\'re looking for {service} in the area.',
    hashtags: [],
    isBuiltIn: true,
  },
  {
    name: 'Review to Social Post',
    platform: 'all',
    category: 'review_repurpose',
    title: '5-Star Review',
    body: 'We love hearing from our customers!\n\n"{review_quote}"\n— {customer_name}\n\nThank you for choosing {business_name}! We\'re dedicated to providing the best {service} in {neighborhood}.',
    hashtags: ['#5stars', '#customerlove', '#testimonial'],
    isBuiltIn: true,
  },
  {
    name: 'Seasonal Promo',
    platform: 'all',
    category: 'seasonal_promo',
    title: '{season} Special!',
    body: '{season} is here and {business_name} has a special offer for you!\n\nGet {discount} off {service} when you book this {season}. Limited availability — first come, first served.\n\nServing {neighborhood} and surrounding areas. Book today!',
    hashtags: ['#specialoffer', '#limitedtime', '#deal'],
    isBuiltIn: true,
  },
  {
    name: 'Quick Tip',
    platform: 'all',
    category: 'tip_content',
    title: 'Quick Tip from {business_name}',
    body: 'Pro tip: {tip_content}\n\nFor professional {service}, trust the experts at {business_name}. Serving {neighborhood} with quality and care.',
    hashtags: ['#protip', '#diy', '#homecare'],
    isBuiltIn: true,
  },
  {
    name: 'Service Spotlight',
    platform: 'instagram',
    category: 'service_spotlight',
    title: 'Did You Know?',
    body: 'Did you know {business_name} offers {service}?\n\nOur team of professionals is ready to help you with all your needs. From small jobs to large projects, we do it all.\n\nServing {neighborhood} | Call us today for a free estimate!',
    hashtags: ['#services', '#professional', '#quality'],
    isBuiltIn: true,
  },
];

export const REVIEW_RESPONSE_TEMPLATES = {
  positive: [
    'Thank you so much, {reviewer_name}! We loved working with you and are thrilled you\'re happy with the results. We look forward to serving you again!',
    'Wow, thank you {reviewer_name}! Your kind words mean the world to our team. It was a pleasure helping you with your {service} needs!',
    'Thanks for the amazing review, {reviewer_name}! We take pride in delivering great results and it\'s wonderful to hear from satisfied customers.',
  ],
  negative: [
    'Thank you for your feedback, {reviewer_name}. We\'re sorry to hear about your experience and would love the opportunity to make things right. Please contact us at {phone} so we can address your concerns directly.',
    '{reviewer_name}, we appreciate you taking the time to share your experience. This isn\'t the standard we hold ourselves to. Please reach out to us at {email} so we can discuss how to resolve this.',
  ],
  neutral: [
    'Thank you for your review, {reviewer_name}! We appreciate your feedback and are always looking for ways to improve. We hope to serve you again soon!',
  ],
};

export const REVIEW_REQUEST_TEMPLATES = {
  initial: {
    subject: 'How was your experience with {business_name}?',
    body: 'Hi {customer_name},\n\nThank you for choosing {business_name} for your recent {service}! We hope everything went well.\n\nIf you had a great experience, we\'d really appreciate it if you could leave us a quick review on Google. It only takes a minute and helps other people in {neighborhood} find us.\n\n{review_link}\n\nThank you so much!\n\nBest regards,\n{business_name}',
  },
  followup: {
    subject: 'Quick reminder from {business_name}',
    body: 'Hi {customer_name},\n\nJust a friendly reminder — if you have a moment, we\'d love to hear about your experience with {business_name}.\n\nYour review helps us improve and helps neighbors in {neighborhood} find quality {service}.\n\n{review_link}\n\nThanks again for your business!\n\n{business_name}',
  },
};

export const RETENTION_TEMPLATES = {
  seasonal_refresh: {
    subject: 'Time for your {season} refresh!',
    body: 'Hi {customer_name},\n\nIt\'s been a while since your last {service} with {business_name}! With {season} here, now is the perfect time for a refresh.\n\nAs a valued customer, we\'re offering you a special returning customer discount. Book this week and save!\n\nCall us at {phone} or reply to schedule.\n\nBest,\n{business_name}',
  },
  maintenance: {
    subject: 'Maintenance reminder from {business_name}',
    body: 'Hi {customer_name},\n\nIt\'s been about 6 months since your last {service}. Regular maintenance helps protect your investment and keeps everything looking great.\n\nWe\'d love to help you stay on top of it. Shall we schedule your next appointment?\n\nBest,\n{business_name}',
  },
};

export const B2B_INDUSTRY_TEMPLATES = {
  property_manager: {
    subject: 'Professional {service} for your properties',
    body: 'Hi {contact_name},\n\nI\'m reaching out from {business_name}. We specialize in professional {service} for property management companies in {location}.\n\nWe offer:\n- Volume pricing for multi-unit properties\n- Flexible scheduling around tenant move-in/move-out\n- Consistent quality across all your properties\n- Quick turnaround times\n\nI\'d love to discuss how we can help with your {service} needs. Would you be open to a quick call this week?\n\nBest regards,\n{your_name}\n{business_name}',
  },
  real_estate: {
    subject: 'Help your listings shine — {service} before showings',
    body: 'Hi {contact_name},\n\nClean, well-maintained homes sell faster and for more money. {business_name} helps real estate agents in {location} prepare listings with professional {service}.\n\nOur pre-listing packages include:\n- Deep {service} for the entire property\n- Quick turnaround (24-48 hours)\n- Competitive agent referral pricing\n\nLet\'s help your listings make a great first impression. Interested in learning more?\n\nBest,\n{your_name}\n{business_name}',
  },
  airbnb: {
    subject: 'Professional {service} for your rental properties',
    body: 'Hi {contact_name},\n\nGuest reviews make or break short-term rental success. {business_name} provides reliable {service} for Airbnb and vacation rental operators in {location}.\n\nWe offer:\n- Consistent quality between guest turnovers\n- Flexible scheduling for check-out/check-in windows\n- Bulk pricing for multiple properties\n- Emergency availability\n\nWould you be interested in a trial at one of your properties?\n\n{your_name}\n{business_name}',
  },
  office: {
    subject: 'Commercial {service} for your office',
    body: 'Hi {contact_name},\n\nA clean workplace improves employee productivity and makes a great impression on clients. {business_name} provides professional commercial {service} in {location}.\n\nWe offer flexible contracts:\n- Weekly, bi-weekly, or monthly service\n- After-hours scheduling\n- Competitive commercial rates\n\nI\'d love to provide a free estimate for your office. When would be a good time to connect?\n\n{your_name}\n{business_name}',
  },
};
