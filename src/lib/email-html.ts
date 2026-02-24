// Converts a plain-text email body into a tracked HTML email.
//
// 1. Escapes HTML entities for safety
// 2. Wraps any URLs with a click-tracking redirect (/api/track/click)
// 3. Converts line breaks into proper paragraph structure
// 4. Wraps everything in a professional, responsive email template
// 5. Appends a 1x1 tracking pixel for open detection (/api/track/open)

const URL_REGEX = /(https?:\/\/[^\s<>"']+)/gi;

function escapeAndTrackLinks(text: string, trackingId: string, baseUrl: string, linkStyle: string): string {
  // Escape basic HTML entities
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Wrap URLs with click tracking
  html = html.replace(URL_REGEX, (url) => {
    const trackUrl = `${baseUrl}/api/track/click?id=${encodeURIComponent(trackingId)}&url=${encodeURIComponent(url)}`;
    return `<a href="${trackUrl}" style="${linkStyle}">${url}</a>`;
  });

  return html;
}

function textToParagraphs(text: string, trackingId: string, baseUrl: string, pStyle: string, linkStyle: string): string {
  const processed = escapeAndTrackLinks(text, trackingId, baseUrl, linkStyle);

  return processed
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n/g, '<br>\n'))
    .map((p) => `<p style="${pStyle}">${p}</p>`)
    .join('\n');
}

export function textToTrackedHtml(
  body: string,
  trackingId: string,
  baseUrl: string
): string {
  // Split on the --- separator to separate main body from unsubscribe footer
  const separatorIndex = body.indexOf('\n\n---\n');
  let mainBody: string;
  let footerBody: string | null = null;

  if (separatorIndex !== -1) {
    mainBody = body.substring(0, separatorIndex);
    footerBody = body.substring(separatorIndex + 5); // skip \n\n---\n
  } else {
    mainBody = body;
  }

  // Build main body paragraphs
  const bodyPStyle = 'margin:0 0 16px 0;font-size:15px;line-height:1.7;color:#1a1a1a;';
  const bodyLinkStyle = 'color:#2563eb;text-decoration:underline;';
  const mainHtml = textToParagraphs(mainBody, trackingId, baseUrl, bodyPStyle, bodyLinkStyle);

  // Build footer section if present
  let footerHtml = '';
  if (footerBody) {
    const footerPStyle = 'margin:0 0 8px 0;font-size:12px;line-height:1.5;color:#9ca3af;';
    const footerLinkStyle = 'color:#9ca3af;text-decoration:underline;';
    footerHtml = textToParagraphs(footerBody, trackingId, baseUrl, footerPStyle, footerLinkStyle);
  }

  // Tracking pixel URL
  const pixelUrl = `${baseUrl}/api/track/open?id=${encodeURIComponent(trackingId)}`;

  // Build the footer row only if there is footer content
  const footerSection = footerHtml
    ? `
          <!-- Divider -->
          <tr>
            <td style="padding:0 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="border-top:1px solid #e8e8ed;font-size:1px;line-height:1px;">&nbsp;</td></tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px 28px 40px;text-align:center;">
${footerHtml}
            </td>
          </tr>`
    : '';

  return `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title></title>
  <!--[if mso]>
  <style>table,td,p{font-family:Arial,Helvetica,sans-serif !important;}</style>
  <![endif]-->
  <style>
    /* Reset */
    body,table,td,p,a,li,blockquote{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
    table,td{mso-table-lspace:0;mso-table-rspace:0;}
    img{-ms-interpolation-mode:bicubic;border:0;outline:none;text-decoration:none;}
    body{margin:0;padding:0;width:100%!important;height:100%!important;}

    /* Mobile responsive */
    @media only screen and (max-width:620px){
      .email-container{width:100%!important;max-width:100%!important;}
      .email-body-inner{padding:24px 16px!important;}
      .email-footer-inner{padding:16px!important;}
      .email-divider{padding:0 16px!important;}
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;">
  <!-- Background wrapper table -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f7;">
    <tr>
      <td align="center" style="padding:32px 16px;">

        <!-- Email container -->
        <table role="presentation" class="email-container" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border:1px solid #e2e2e8;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.04);">

          <!-- Body content -->
          <tr>
            <td class="email-body-inner" style="padding:36px 40px 20px 40px;">
${mainHtml}
            </td>
          </tr>
${footerSection}
        </table>

        <!-- Tracking pixel (outside container, invisible) -->
        <img src="${pixelUrl}" alt="" width="1" height="1" style="display:block;width:1px;height:1px;border:0;overflow:hidden;opacity:0;" />

      </td>
    </tr>
  </table>
</body>
</html>`;
}
