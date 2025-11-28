import { NextResponse } from 'next/server';
import { listHtmlMessages, getOrCreateProcessedLabel, markMessageProcessed } from '@/lib/gmail';
import { parseKindleHtml, kindleNotebookToMarkdown } from '@/lib/kindle';
import { sendDocument } from '@/lib/telegram';
import { sendEmail } from '@/lib/email';

export const runtime = 'nodejs';

function sanitizeFilename(name: string) {
  return name.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '').trim() || 'Kindle-Notes';
}

function buildMarkdownName(title: string, attachmentName: string) {
  const fallback = attachmentName.replace(/\.html?$/i, '') || 'Kindle-Notes';
  const base = sanitizeFilename(title || fallback);
  return `${base}.md`;
}

export async function GET() {
  const inboxUser = process.env.BOT_INBOX_EMAIL;
  const trustedSender = process.env.TRUSTED_SENDER_EMAIL;
  const ownerChatId = process.env.OWNER_CHAT_ID;
  const obsidianInbox = process.env.OBSIDIAN_INBOX_EMAIL;
  const processedLabelName = process.env.PROCESSED_LABEL_NAME ?? 'ProcessedByKindleBot';

  if (!inboxUser || !trustedSender || !ownerChatId) {
    return NextResponse.json(
      { ok: false, error: 'Missing BOT_INBOX_EMAIL, TRUSTED_SENDER_EMAIL, or OWNER_CHAT_ID' },
      { status: 500 },
    );
  }

  try {
    const messages = await listHtmlMessages(inboxUser, processedLabelName);
    if (!messages.length) {
      return NextResponse.json({ ok: true, processed: 0, skipped: 0 });
    }

    const labelId = await getOrCreateProcessedLabel(inboxUser, processedLabelName);
    let processed = 0;
    let skipped = 0;

    for (const message of messages) {
      if (message.fromAddress !== trustedSender.toLowerCase()) {
        skipped += 1;
        console.log('Skip untrusted sender', { messageId: message.id, from: message.fromHeader });
        continue;
      }

      for (const attachment of message.attachments) {
        const htmlText = attachment.data.toString('utf8');
        const notebook = parseKindleHtml(htmlText);
        const markdown = kindleNotebookToMarkdown(notebook);
        const filename = buildMarkdownName(notebook.title, attachment.filename);

        await sendDocument(ownerChatId, {
          filename,
          content: Buffer.from(markdown, 'utf8'),
          contentType: 'text/markdown',
          caption: `Kindle notes: ${notebook.title}`,
        });

        if (obsidianInbox) {
          await sendEmail({
            to: obsidianInbox,
            subject: notebook.title ? `${notebook.title} — Kindle notes` : 'Kindle notes',
            text: 'Converted from Kindle notebook attachment.',
            attachments: [
              {
                filename,
                content: markdown,
                contentType: 'text/markdown',
              },
            ],
          });
        }
      }

      await markMessageProcessed(inboxUser, message.id, labelId);
      processed += 1;
    }

    return NextResponse.json({ ok: true, processed, skipped });
  } catch (error) {
    console.error('/api/check-mail failed', error);
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 });
  }
}
