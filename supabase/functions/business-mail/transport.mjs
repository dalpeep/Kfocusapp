import {createHash, randomBytes} from 'node:crypto';
import {Buffer} from 'node:buffer';

const replyTo = 'info@daltownmap.com';
const emailPattern = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
const imageSignatures = {
  'image/png': bytes => bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')),
  'image/jpeg': bytes => bytes.subarray(0,3).equals(Buffer.from('ffd8ff','hex')),
  'image/webp': bytes => bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WEBP'
};
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
}[char]));

export function hashBusinessMailToken(token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new Error('Invalid token');
  return createHash('sha256').update(token).digest('hex');
}

export function createBusinessMailToken(purpose) {
  if (!['verify','unsubscribe'].includes(purpose)) throw new Error('Invalid purpose');
  const token = randomBytes(32).toString('hex');
  return {
    hash: hashBusinessMailToken(token),
    link: 'https://daltownmap.com/business-mail/#' + new URLSearchParams({purpose, token})
  };
}

export function buildBusinessMail({from, to, subject, body, businessName, images = [], unsubscribe}) {
  if (![from,to].every(value => typeof value === 'string' && value.length <= 254 && emailPattern.test(value))) {
    throw new Error('Invalid address');
  }
  if (typeof subject !== 'string' || !subject.trim() || subject.length > 160 || /[\r\n]/.test(subject) ||
      typeof body !== 'string' || !body.trim() || body.length > 10000) throw new Error('Invalid message');
  if (!Array.isArray(images) || images.length > 4) throw new Error('Too many images');
  const personalize = text => text.replaceAll('{{업소명}}', () => String(businessName || '업소'));
  const personalizedSubject = personalize(subject);
  if (personalizedSubject.length > 160 || /[\r\n]/.test(personalizedSubject)) throw new Error('Invalid subject');
  const attachments = [];
  let total = 0;
  let html = '<p>' + escapeHtml(personalize(body)).replace(/\r?\n/g,'<br>') + '</p>';
  for (const [index,image] of images.entries()) {
    const {filename, mime, content, inline} = image;
    if (typeof filename !== 'string' || !/^[\p{L}\p{N}_. -]{1,100}$/u.test(filename) ||
        !Object.hasOwn(imageSignatures,mime) || typeof content !== 'string' || content.length > 1_400_000) {
      throw new Error('Invalid image');
    }
    const bytes = Buffer.from(content,'base64');
    total += bytes.length;
    if (total > 1_000_000 || bytes.toString('base64') !== content || !imageSignatures[mime](bytes)) {
      throw new Error('Invalid image data');
    }
    const attachment = {filename,content,content_type:mime};
    if (inline === true) {
      attachment.content_id = 'business-image-' + index;
      html += '<p><img src="cid:' + attachment.content_id + '" alt="' + escapeHtml(filename) + '"></p>';
    }
    attachments.push(attachment);
  }
  if (unsubscribe) {
    const url = new URL(unsubscribe);
    if (url.origin !== 'https://daltownmap.com' || url.pathname !== '/business-mail/' ||
        new URLSearchParams(url.hash.slice(1)).get('purpose') !== 'unsubscribe') throw new Error('Invalid unsubscribe URL');
    html += '<p><a href="' + escapeHtml(url.href) + '">수신 거부</a></p>';
  }
  return {
    from: '달타운맵 운영팀 <' + from + '>', to: [to], reply_to: replyTo,
    subject: personalizedSubject, html, attachments
  };
}

export class ResendResponseError extends Error {
  constructor(status) {
    super('Resend test delivery failed');
    this.status = status;
  }
}

export async function sendBusinessMail({mode, message, requestId, apiKey, internalRecipient, fetcher = fetch}) {
  if (mode !== 'admin-test' || internalRecipient !== replyTo ||
      !Array.isArray(message?.to) || message.to.length !== 1 || message.to[0] !== internalRecipient ||
      message.cc || message.bcc || message.reply_to !== replyTo) throw new Error('Business sending is locked');
  if (!apiKey || typeof requestId !== 'string' || !/^[a-z0-9-]{16,80}$/i.test(requestId)) {
    throw new Error('Test transport unavailable');
  }
  const result = await fetcher('https://api.resend.com/emails', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
    headers: {Authorization: 'Bearer ' + apiKey, 'Content-Type':'application/json',
      'Idempotency-Key':'business-mail-test/' + requestId},
    body: JSON.stringify(message)
  });
  if (!result.ok) {
    await result.body?.cancel();
    throw new ResendResponseError(result.status);
  }
  const data = await result.json();
  if (typeof data.id !== 'string' || !data.id) throw new Error('Resend response missing message ID');
  return data.id;
}
