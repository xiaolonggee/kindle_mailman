import { fetch } from 'undici';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API_BASE = BOT_TOKEN ? `https://api.telegram.org/bot${BOT_TOKEN}` : null;
const FILE_BASE = BOT_TOKEN ? `https://api.telegram.org/file/bot${BOT_TOKEN}` : null;

type TelegramApiResponse<T> = {
  ok: boolean;
  result: T;
  description?: string;
};

async function telegramRequest<T>(method: string, body: unknown): Promise<T> {
  if (!API_BASE) {
    throw new Error('Missing TELEGRAM_BOT_TOKEN');
  }

  const response = await fetch(`${API_BASE}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Telegram API ${method} failed: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as TelegramApiResponse<T>;

  if (!data.ok) {
    throw new Error(`Telegram API ${method} error: ${data.description ?? 'unknown error'}`);
  }

  return data.result;
}

export async function sendMessage(chatId: number | string, text: string) {
  return telegramRequest('sendMessage', {
    chat_id: chatId,
    text,
  });
}

type TelegramFile = {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  file_path?: string;
};

export async function getFile(fileId: string): Promise<TelegramFile> {
  return telegramRequest<TelegramFile>('getFile', { file_id: fileId });
}

export async function downloadFile(filePath: string): Promise<Buffer> {
  if (!FILE_BASE) {
    throw new Error('Missing TELEGRAM_BOT_TOKEN');
  }

  const response = await fetch(`${FILE_BASE}/${filePath}`);

  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
