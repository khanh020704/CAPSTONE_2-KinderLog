import {
  BadGatewayException,
  CallHandler,
  ExecutionContext,
  Global,
  Injectable,
  Logger,
  Module,
  NestInterceptor,
  OnModuleInit,
  StreamableFile,
} from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { createHmac, randomUUID } from 'crypto';
import type { Request } from 'express';
import { promises as fs } from 'fs';
import { join } from 'path';
import { map, Observable } from 'rxjs';
import { uploadRoot } from '../daily-journals/upload.config';

const IMAGEKIT_UPLOAD = 'https://upload.imagekit.io/api/v1/files/upload';
const IMAGEKIT_FILES = 'https://api.imagekit.io/v1/files';
const REMOVE_RETRY_MS = [15_000, 60_000]; // look a removed file up again after 15 s, then 60 s
const FILE_NAME = /^[\w.-]+$/;
/** The image types photoUpload() accepts. */
const PHOTO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/heic': '.heic',
};

/** photos: journal photos and student avatars · audio: voice-journal recordings (kept for listening back). */
export type MediaKind = 'photos' | 'audio';
const WHAT: Record<MediaKind, string> = { photos: 'photo', audio: 'recording' };
/**
 * Added to the ImageKit URL. ImageKit treats a .webm recording as a video and transcodes it on delivery (an MP4,
 * counted against the video-processing quota, or a 400 for some files): `orig-true` serves the stored file as is.
 */
const DELIVERY: Record<MediaKind, string> = { photos: '', audio: '?tr=orig-true' };

/**
 * Recordings are private files: ImageKit serves them only through a signed URL. Photos are public files that the
 * account can restrict to signed URLs too (dashboard › Settings › "Restrict unsigned URLs", images and videos).
 */
const PRIVATE: Record<MediaKind, boolean> = { photos: false, audio: true };

/** ImageKit is used when both the URL endpoint and the private key are set (read from .env like upload.config). */
function imageKit() {
  const endpoint = (process.env.IMAGEKIT_URL_ENDPOINT ?? '').replace(/\/+$/, '');
  const root = (process.env.IMAGEKIT_FOLDER || '/kinderlog').replace(/\/+$/, '');
  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY ?? '';
  return {
    endpoint,
    root,
    folder: (kind: MediaKind) => `${root}/${kind}`,
    privateKey,
    enabled: !!endpoint && !!privateKey,
    /** Signed URLs stay valid between one and two of these (seconds). */
    ttl: Math.max(60, Number(process.env.IMAGEKIT_SIGNED_URL_TTL || 3600)),
  };
}

/** Where new uploads go: reported by GET /health. */
export const mediaStorageKind = () => (imageKit().enabled ? 'imagekit' : 'disk');

const SIGNATURE = /[?&]ik-[ts]=[^&]*/g;

/**
 * The URL handed to a browser for a file of the ImageKit folder: `ik-t` (expiry) and `ik-s` (HMAC-SHA1 of the URL
 * after the endpoint followed by `ik-t`, keyed with the private key). The expiry is rounded to the TTL, so a URL
 * stays the same for a while and the browser cache keeps working. Anything else is returned unchanged.
 */
export function signMediaUrl(url: string, now = Date.now()): string {
  const ik = imageKit();
  if (!ik.enabled || !url.startsWith(`${ik.endpoint}${ik.root}/`) || url.includes('ik-s=')) return url;
  const expires = (Math.floor(now / 1000 / ik.ttl) + 2) * ik.ttl;
  const signature = createHmac('sha1', ik.privateKey)
    .update(url.slice(ik.endpoint.length + 1) + expires)
    .digest('hex');
  return `${url}${url.includes('?') ? '&' : '?'}ik-t=${expires}&ik-s=${signature}`;
}

/** A signed URL sent back by the browser (e.g. the photos of a journal being edited) → the stored address. */
export function unsignMediaUrl(url: string): string {
  const { endpoint } = imageKit();
  if (!endpoint || !url.startsWith(`${endpoint}/`) || !url.includes('ik-')) return url;
  const stripped = url.replace(SIGNATURE, '');
  return stripped.includes('?') || !stripped.includes('&') ? stripped : stripped.replace('&', '?');
}

/** Applies `fn` to every string inside a JSON-like value, in place (entities keep their class). */
function mapStrings(value: unknown, fn: (s: string) => string, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') return fn(value);
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  if (
    value instanceof Date ||
    value instanceof StreamableFile ||
    Buffer.isBuffer(value) ||
    ArrayBuffer.isView(value) ||
    typeof (value as { pipe?: unknown }).pipe === 'function'
  )
    return value;
  seen.add(value);
  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) obj[key] = mapStrings(obj[key], fn, seen);
  return value;
}

/**
 * Stored addresses are never signed. Every response has the addresses of ImageKit files signed on the way out, and
 * every request body has them unsigned on the way in (before validation), so the browser can send back what it got.
 */
@Injectable()
export class SignedMediaInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http' || !imageKit().enabled) return next.handle();
    const req = ctx.switchToHttp().getRequest<Request>();
    if (req.body && typeof req.body === 'object') mapStrings(req.body, unsignMediaUrl);
    const now = Date.now();
    return next.handle().pipe(map((data) => mapStrings(data, (s) => signMediaUrl(s, now))));
  }
}

/**
 * An address a journal or a profile may point at: a file this API stored, on disk (/uploads/<kind>/<file>) or in
 * the configured ImageKit folder (<endpoint>/<folder>/<kind>/<file>). Nothing from elsewhere: parents' pages show them.
 */
export function isUploaded(kind: MediaKind, url: unknown): boolean {
  if (typeof url !== 'string') return false;
  const local = `/uploads/${kind}/`;
  if (url.startsWith(local)) return FILE_NAME.test(url.slice(local.length));
  const { endpoint, folder } = imageKit();
  const base = `${endpoint}${folder(kind)}/`;
  const file = DELIVERY[kind] && url.endsWith(DELIVERY[kind]) ? url.slice(0, -DELIVERY[kind].length) : url;
  return !!endpoint && file.startsWith(base) && FILE_NAME.test(file.slice(base.length));
}
export const isUploadedPhoto = (url: unknown) => isUploaded('photos', url);
export const isUploadedAudio = (url: unknown) => isUploaded('audio', url);

/**
 * Stores uploads in ImageKit when it is configured, else under UPLOAD_DIR/<kind> (served at /uploads/<kind>).
 * Returns the address to save.
 */
@Injectable()
export class MediaStorageService implements OnModuleInit {
  private readonly logger = new Logger(MediaStorageService.name);

  /** The upload folders exist from the start (the static /uploads route and the system metrics rely on them). */
  async onModuleInit() {
    for (const kind of ['photos', 'audio'] satisfies MediaKind[]) {
      await fs.mkdir(join(uploadRoot(), kind), { recursive: true });
    }
  }

  /** Several photos are sent at once: ImageKit takes about two seconds per upload. */
  saveAll(files: Express.Multer.File[], kind: MediaKind): Promise<string[]> {
    return Promise.all(files.map((f) => this.save(f, kind)));
  }

  /** `ext` overrides the extension of the original file name (recordings are named after their MIME type). */
  async save(file: Express.Multer.File, kind: MediaKind, ext?: string): Promise<string> {
    // Named after the checked image type, never the browser's file name (a "photo" called x.html would be served as a page).
    const name = `${randomUUID()}${ext ?? PHOTO_EXT[file.mimetype] ?? '.jpg'}`;
    const ik = imageKit();
    try {
      if (!ik.enabled) {
        const dir = join(uploadRoot(), kind);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(join(dir, name), file.buffer);
        return `/uploads/${kind}/${name}`;
      }
      const form = new FormData();
      form.append('file', new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }), name);
      form.append('fileName', name);
      form.append('folder', ik.folder(kind));
      form.append('useUniqueFileName', 'false');
      form.append('isPrivateFile', String(PRIVATE[kind]));
      const res = await fetch(IMAGEKIT_UPLOAD, {
        method: 'POST',
        headers: { Authorization: this.auth(ik.privateKey) },
        body: form,
        signal: AbortSignal.timeout(60_000),
      });
      const body = (await res.json().catch(() => ({}))) as { url?: string; message?: string };
      if (!res.ok || !body.url)
        throw new Error(`ImageKit ${res.status}: ${body.message ?? 'no URL returned'}`);
      return body.url + DELIVERY[kind];
    } catch (err) {
      this.logger.error(`Could not store the ${WHAT[kind]}: ${(err as Error).message}`);
      throw new BadGatewayException(`The ${WHAT[kind]} could not be stored. Please try again.`);
    }
  }

  /** Removes a file this API stored; anything else (seed URLs, already gone) is left alone. Never throws. */
  async remove(kind: MediaKind, url: string | null | undefined): Promise<void> {
    if (!url || !isUploaded(kind, url)) return;
    try {
      if (url.startsWith('/uploads/')) {
        await fs.unlink(join(uploadRoot(), url.replace(/^\/uploads\//, '')));
        return;
      }
      await this.removeFromImageKit(kind, url, 0);
    } catch (err) {
      this.logger.warn(`Could not remove ${url}: ${(err as Error).message}`);
    }
  }

  /**
   * ImageKit finds a file by name through its search index, which lags a few seconds behind an upload: a file
   * replaced right after it was uploaded is looked up again in the background before giving up.
   */
  private async removeFromImageKit(kind: MediaKind, url: string, attempt: number): Promise<void> {
    const ik = imageKit();
    if (!ik.enabled) return;
    const path = url.split('?')[0];
    const name = path.slice(path.lastIndexOf('/') + 1);
    const query = new URLSearchParams({ path: ik.folder(kind), searchQuery: `name = "${name}"`, limit: '1' });
    const auth = { Authorization: this.auth(ik.privateKey) };
    const found = (await (await fetch(`${IMAGEKIT_FILES}?${query}`, { headers: auth })).json()) as {
      fileId: string;
    }[];
    if (Array.isArray(found) && found[0]) {
      await fetch(`${IMAGEKIT_FILES}/${found[0].fileId}`, { method: 'DELETE', headers: auth });
      return;
    }
    const retryIn = REMOVE_RETRY_MS[attempt];
    if (retryIn === undefined) {
      this.logger.warn(`Could not find ${url} in ImageKit to remove it`);
      return;
    }
    setTimeout(
      () =>
        void this.removeFromImageKit(kind, url, attempt + 1).catch((err: Error) =>
          this.logger.warn(err.message),
        ),
      retryIn,
    ).unref();
  }

  private auth(privateKey: string) {
    return 'Basic ' + Buffer.from(`${privateKey}:`).toString('base64');
  }
}

@Global()
@Module({
  providers: [MediaStorageService, { provide: APP_INTERCEPTOR, useClass: SignedMediaInterceptor }],
  exports: [MediaStorageService],
})
export class MediaStorageModule {}
