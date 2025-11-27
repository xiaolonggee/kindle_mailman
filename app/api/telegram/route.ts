import { NextResponse } from 'next/server';
import { downloadFile, getFile, sendMessage } from '@/lib/telegram';
import { parseCommand } from '@/lib/commands';
import { sendToKindle } from '@/lib/email';

export const runtime = 'nodejs';

type TelegramUser = {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
};

type TelegramChat = {
  id: number | string;
  title?: string;
  username?: string;
  type: string;
};

type TelegramMessage = {
  message_id: number;
  text?: string;
  caption?: string;
  chat: TelegramChat;
  from?: TelegramUser;
  document?: {
    file_id: string;
    file_name?: string;
    mime_type?: string;
    file_size?: number;
  };
  photo?: {
    file_id: string;
    width: number;
    height: number;
    file_size?: number;
  }[];
};

type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
};

function verifyWebhookSecret(request: Request) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected) return true;

  const received = request.headers.get('x-telegram-bot-api-secret-token');
  return received === expected;
}

function buildSubject(message: TelegramMessage) {
  const user = message.from;
  const name = [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim();
  const username = user?.username ? `@${user.username}` : '';
  return `Telegram → Kindle | ${name || username || `chat ${message.chat.id}`}`;
}

function helpMessage() {
  return [
    'Send to Kindle via /send:',
    '/send <text to forward>',
    'You can also send a file (PDF/DOCX/EPUB/TXT/JPG/PNG) directly.',
    '',
    'Example:',
    '/send This is my note for Kindle.',
  ].join('\n');
}

async function buildDocumentAttachment(document: NonNullable<TelegramMessage['document']>) {
  const file = await getFile(document.file_id);
  if (!file.file_path) {
    throw new Error('Telegram did not return file_path for document');
  }

  const content = await downloadFile(file.file_path);

  return {
    filename: document.file_name ?? `document-${document.file_id}`,
    content,
    contentType: document.mime_type,
  };
}

async function buildPhotoAttachment(photoSizes: NonNullable<TelegramMessage['photo']>) {
  const largest = photoSizes[photoSizes.length - 1];
  const file = await getFile(largest.file_id);
  if (!file.file_path) {
    throw new Error('Telegram did not return file_path for photo');
  }

  const content = await downloadFile(file.file_path);

  return {
    filename: `photo-${largest.file_id}.jpg`,
    content,
    contentType: 'image/jpeg',
  };
}

export async function POST(request: Request) {
  if (!verifyWebhookSecret(request)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  let update: TelegramUpdate;

  try {
    update = (await request.json()) as TelegramUpdate;
  } catch (error) {
    console.error('Invalid Telegram webhook payload', error);
    return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 });
  }

  const message = update.message ?? update.edited_message;

  if (!message) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  try {
    if (message?.document || (message?.photo && message.photo.length > 0)) {
      const attachments = [];

      if (message.document) {
        attachments.push(await buildDocumentAttachment(message.document));
      } else if (message.photo) {
        attachments.push(await buildPhotoAttachment(message.photo));
      }

      await sendToKindle({
        subject: buildSubject(message),
        text: message.caption || 'Forwarded from Telegram',
        attachments,
      });

      await sendMessage(message.chat.id, 'Delivered to Kindle ✅ (attachment)');
      return NextResponse.json({ ok: true });
    }

    if (!message?.text) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const command = parseCommand(message.text);

    if (command.type === 'start') {
      await sendMessage(message.chat.id, helpMessage());
      return NextResponse.json({ ok: true });
    }

    if (command.type === 'send') {
      await sendToKindle({
        subject: buildSubject(message),
        text: command.text,
      });

      await sendMessage(message.chat.id, 'Delivered to Kindle ✅');
      return NextResponse.json({ ok: true });
    }

    await sendMessage(message.chat.id, 'Unknown command. Use /send <text> to forward to Kindle.');
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Telegram webhook error', error);
    try {
      await sendMessage(message.chat.id, 'Sorry, failed to deliver. Please try again.');
    } catch (notifyError) {
      console.error('Failed to notify user about the error', notifyError);
    }
    return NextResponse.json({ ok: false, error: 'delivery failed' }, { status: 500 });
  }
}

export function GET() {
  return NextResponse.json({ ok: true });
}
