import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

// Image metadata
export const alt = 'AnonTweet - Anonymous Social Media Platform';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export const runtime = 'nodejs';

// The brand mark, embedded so the card is rendered from the real logo rather
// than re-typing the wordmark. Uses the pre-trimmed 1024px icon (the source
// plate is mostly whitespace) and presents it as a white tile so the black
// artwork reads cleanly on the dark card. Cached across invocations.
let logoDataUri = null;
async function getLogo() {
  if (logoDataUri) return logoDataUri;
  const file = path.join(process.cwd(), 'public', 'icon-1024.png');
  const buf = await readFile(file);
  logoDataUri = `data:image/png;base64,${buf.toString('base64')}`;
  return logoDataUri;
}

// Image generation
export default async function Image() {
  const logo = await getLogo();
  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(to bottom right, #0b1220, #1e3a8a)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 28,
          color: 'white',
          fontFamily: 'system-ui',
        }}
      >
        <div
          style={{
            width: 400,
            height: 400,
            borderRadius: 56,
            overflow: 'hidden',
            background: 'white',
            display: 'flex',
          }}
        >
          {/* Satori (next/og) renders plain <img>; next/image is not supported here. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logo}
            alt=""
            width={400}
            height={400}
            style={{ objectFit: 'cover' }}
          />
        </div>
        <div
          style={{
            fontSize: 44,
            opacity: 0.95,
            textAlign: 'center',
            padding: '0 80px',
            lineHeight: 1.3,
          }}
        >
          Post, message, go live &amp; play games — anonymously.
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
